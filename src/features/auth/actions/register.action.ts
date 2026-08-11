"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";

import { auditService } from "@/features/audit/services/audit.service";
import { isPublicRegisterEnabled } from "@/features/auth/lib/public-register";
import { registerSchema } from "@/features/auth/schemas/auth.schema";
import { bootstrapCustomerTenant } from "@/features/tenants/services/bootstrap-customer-tenant";
import { tenantService } from "@/features/tenants/services/tenant.service";
import { roleRepository } from "@/features/users/repositories/role.repository";
import { userRepository } from "@/features/users/repositories/user.repository";
import { syncCredentialAccountPassword } from "@/lib/auth/auth";
import { rateLimit } from "@/lib/cache/redis";
import { logger } from "@/lib/shared/logger";

export async function registerAction(
  _prev: { error?: string; success?: boolean },
  formData: FormData,
) {
  if (!isPublicRegisterEnabled()) {
    return {
      error:
        "Public registration is closed. Contact your administrator to create an organization.",
    };
  }

  const raw = {
    organizationName: formData.get("organizationName"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await rateLimit(`register:${ip}`, 5, 3600);
  if (!allowed) {
    return { error: "Too many sign-up attempts. Please try again later." };
  }

  const { organizationName, name, email, password } = parsed.data;

  try {
    const tenant = await tenantService.createOrganization(organizationName);
    await bootstrapCustomerTenant(tenant.id);

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await userRepository.create({
      tenantId: tenant.id,
      email,
      name,
      passwordHash,
    });
    await syncCredentialAccountPassword(user.id, passwordHash);

    const adminRole = await roleRepository.findBySlug(tenant.id, "tenant_admin");
    if (adminRole) {
      await userRepository.assignRole(user.id, adminRole.id);
    }

    await auditService.log({
      tenantId: tenant.id,
      userId: user.id,
      action: "tenant.registered",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: { slug: tenant.slug },
    });

    return { success: true };
  } catch (e) {
    logger.error({ err: e }, "Registration failed");
    return { error: "Registration failed. Please try again." };
  }
}
