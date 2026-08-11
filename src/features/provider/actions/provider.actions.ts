"use server";

import { revalidatePath } from "next/cache";

import {
  createProviderCustomerUserSchema,
  createTenantWithAdminSchema,
  deleteProviderCustomerUserSchema,
  tenantIdSchema,
  updateProviderCustomerBrandingSchema,
  updateProviderCustomerUserSchema,
} from "@/features/provider/schemas/provider.schema";
import { providerService } from "@/features/provider/services/provider.service";
import { requirePlatformOperator } from "@/lib/auth/permissions";
import { logger } from "@/lib/shared/logger";

function revalidateProviderPages(tenantId?: string) {
  revalidatePath("/provider");
  revalidatePath("/provider/tenants");
  if (tenantId) {
    revalidatePath(`/provider/tenants/${tenantId}`);
  }
}

type ProviderMutationResult =
  | { success: true }
  | { success: false; error: string };

export async function getProviderSummaryAction() {
  await requirePlatformOperator();
  return providerService.getSummary();
}

export async function listProviderCustomersAction() {
  await requirePlatformOperator();
  return providerService.listCustomers();
}

export async function getProviderCustomerDetailAction(tenantId: string) {
  await requirePlatformOperator();
  const parsed = tenantIdSchema.safeParse({ tenantId });
  if (!parsed.success) {
    return null;
  }
  return providerService.getCustomerDetail(parsed.data.tenantId);
}

type CreateProviderCustomerResult =
  | {
      success: true;
      tenant: { id: string; name: string; slug: string };
      admin: { id: string; email: string; name: string };
    }
  | { success: false; error: string };

export async function createProviderCustomerAction(
  input: unknown,
): Promise<CreateProviderCustomerResult> {
  const session = await requirePlatformOperator();
  const parsed = createTenantWithAdminSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const result = await providerService.createCustomerWithAdmin(
      session.user.id,
      parsed.data,
    );
    revalidateProviderPages(result.tenant.id);
    return {
      success: true,
      tenant: result.tenant,
      admin: result.admin,
    };
  } catch (e) {
    logger.error({ err: e }, "Provider create customer failed");
    return {
      success: false,
      error:
        e instanceof Error ? e.message : "Failed to create customer organization",
    };
  }
}

export async function disableProviderCustomerAction(
  tenantId: string,
): Promise<ProviderMutationResult> {
  const session = await requirePlatformOperator();
  const parsed = tenantIdSchema.safeParse({ tenantId });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    await providerService.disableCustomer(
      parsed.data.tenantId,
      session.user.id,
    );
    revalidateProviderPages(parsed.data.tenantId);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to disable organization",
    };
  }
}

export async function restoreProviderCustomerAction(
  tenantId: string,
): Promise<ProviderMutationResult> {
  const session = await requirePlatformOperator();
  const parsed = tenantIdSchema.safeParse({ tenantId });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    await providerService.restoreCustomer(
      parsed.data.tenantId,
      session.user.id,
    );
    revalidateProviderPages(parsed.data.tenantId);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to restore organization",
    };
  }
}

export async function updateProviderCustomerBrandingAction(
  input: unknown,
): Promise<ProviderMutationResult> {
  const session = await requirePlatformOperator();
  const parsed = updateProviderCustomerBrandingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    await providerService.updateCustomerBranding(session.user.id, parsed.data);
    revalidateProviderPages(parsed.data.tenantId);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to update organization",
    };
  }
}

export async function listProviderCustomerUsersAction(tenantId: string) {
  await requirePlatformOperator();
  const parsed = tenantIdSchema.safeParse({ tenantId });
  if (!parsed.success) {
    return null;
  }
  return providerService.listCustomerUsers(parsed.data.tenantId);
}

type ProviderUserMutationResult =
  | {
      success: true;
      user: {
        id: string;
        name: string | null;
        email: string;
        image: string | null;
        userRoles: { role: { slug: string; name: string } }[];
        department: { id: string; name: string } | null;
      } | null;
    }
  | { success: false; error: string };

function mapUserResult(
  user: Awaited<ReturnType<typeof providerService.createCustomerUser>>,
): ProviderUserMutationResult {
  if (!user) {
    return { success: true, user: null };
  }

  return {
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      userRoles: user.userRoles.map((userRole) => ({
        role: {
          slug: userRole.role.slug,
          name: userRole.role.name,
        },
      })),
      department: user.department
        ? { id: user.department.id, name: user.department.name }
        : null,
    },
  };
}

export async function createProviderCustomerUserAction(
  input: unknown,
): Promise<ProviderUserMutationResult> {
  const session = await requirePlatformOperator();
  const parsed = createProviderCustomerUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const user = await providerService.createCustomerUser(
      session.user.id,
      parsed.data,
    );
    revalidateProviderPages(parsed.data.tenantId);
    return mapUserResult(user);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to create user",
    };
  }
}

export async function updateProviderCustomerUserAction(
  input: unknown,
): Promise<ProviderUserMutationResult> {
  const session = await requirePlatformOperator();
  const parsed = updateProviderCustomerUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const user = await providerService.updateCustomerUser(
      session.user.id,
      parsed.data,
    );
    revalidateProviderPages(parsed.data.tenantId);
    return mapUserResult(user);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to update user",
    };
  }
}

export async function deleteProviderCustomerUserAction(
  input: unknown,
): Promise<ProviderMutationResult> {
  const session = await requirePlatformOperator();
  const parsed = deleteProviderCustomerUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    await providerService.deleteCustomerUser(session.user.id, parsed.data);
    revalidateProviderPages(parsed.data.tenantId);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to delete user",
    };
  }
}
