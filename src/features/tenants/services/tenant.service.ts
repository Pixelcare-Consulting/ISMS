import { auditService } from "@/features/audit/services/audit.service";
import { tenantRepository } from "@/features/tenants/repositories/tenant.repository";
import {
  resolveTenantTagline,
  type TenantBranding,
} from "@/features/tenants/types/tenant-branding";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const tenantService = {
  async createOrganization(
    name: string,
    options?: { isPlatform?: boolean },
  ) {
    const baseSlug = slugify(name) || "org";
    let slug = baseSlug;
    let attempt = 0;

    while (await tenantRepository.findBySlugAny(slug)) {
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }

    return tenantRepository.create({
      name,
      slug,
      isPlatform: options?.isPlatform ?? false,
    });
  },

  getById(tenantId: string) {
    return tenantRepository.findById(tenantId);
  },

  getByIdIncludingDisabled(tenantId: string) {
    return tenantRepository.findByIdIncludingDisabled(tenantId);
  },

  listCustomers() {
    return tenantRepository.listCustomers();
  },

  getSummaryCounts() {
    return tenantRepository.getSummaryCounts();
  },

  async softDeleteCustomer(tenantId: string, actorUserId: string) {
    const tenant = await tenantRepository.findByIdIncludingDisabled(tenantId);
    if (!tenant) {
      throw new Error("Tenant not found");
    }
    if (tenant.isPlatform) {
      throw new Error("The platform tenant cannot be disabled");
    }
    if (tenant.deletedAt) {
      throw new Error("Tenant is already disabled");
    }

    const updated = await tenantRepository.softDelete(tenantId);

    await auditService.log({
      tenantId,
      userId: actorUserId,
      action: "tenant.disabled",
      entityType: "Tenant",
      entityId: tenantId,
      metadata: { slug: tenant.slug, name: tenant.name },
    });

    return updated;
  },

  async restoreCustomer(tenantId: string, actorUserId: string) {
    const tenant = await tenantRepository.findByIdIncludingDisabled(tenantId);
    if (!tenant) {
      throw new Error("Tenant not found");
    }
    if (tenant.isPlatform) {
      throw new Error("The platform tenant cannot be restored this way");
    }
    if (!tenant.deletedAt) {
      throw new Error("Tenant is not disabled");
    }

    const updated = await tenantRepository.restore(tenantId);

    await auditService.log({
      tenantId,
      userId: actorUserId,
      action: "tenant.restored",
      entityType: "Tenant",
      entityId: tenantId,
      metadata: { slug: tenant.slug, name: tenant.name },
    });

    return updated;
  },

  async getBranding(tenantId: string): Promise<TenantBranding | null> {
    const tenant = await tenantRepository.findById(tenantId);
    if (!tenant) return null;

    return {
      name: tenant.name,
      slug: tenant.slug,
      tagline: resolveTenantTagline(tenant.tagline),
      logo: tenant.logo,
    };
  },

  async updateBranding(
    tenantId: string,
    actorUserId: string,
    input: { name: string; tagline: string; logo?: string | null },
  ) {
    const name = input.name.trim();
    const tagline = input.tagline.trim();

    if (name.length < 2) {
      throw new Error("Company name must be at least 2 characters");
    }

    if (tagline.length > 120) {
      throw new Error("Tagline must be 120 characters or fewer");
    }

    const before = await tenantRepository.findById(tenantId);
    if (!before) {
      throw new Error("Tenant not found");
    }

    const tenant = await tenantRepository.updateBranding(tenantId, {
      name,
      tagline: tagline.length > 0 ? tagline : null,
      ...(input.logo !== undefined ? { logo: input.logo } : {}),
    });

    const nameChanged = before.name !== tenant.name;
    const taglineChanged = before.tagline !== tenant.tagline;
    if (nameChanged || taglineChanged) {
      await auditService.log({
        tenantId,
        userId: actorUserId,
        action: "company.updated",
        entityType: "Tenant",
        entityId: tenantId,
        metadata: {
          name: tenant.name,
          tagline: tenant.tagline,
        },
      });
    }

    if (input.logo !== undefined) {
      const hadLogo = Boolean(before.logo);
      const hasLogo = Boolean(tenant.logo);
      if (!hadLogo && hasLogo) {
        await auditService.log({
          tenantId,
          userId: actorUserId,
          action: "company.logo.updated",
          entityType: "Tenant",
          entityId: tenantId,
        });
      } else if (hadLogo && !hasLogo) {
        await auditService.log({
          tenantId,
          userId: actorUserId,
          action: "company.logo.removed",
          entityType: "Tenant",
          entityId: tenantId,
        });
      } else if (hadLogo && hasLogo && before.logo !== tenant.logo) {
        await auditService.log({
          tenantId,
          userId: actorUserId,
          action: "company.logo.updated",
          entityType: "Tenant",
          entityId: tenantId,
        });
      }
    }

    return {
      name: tenant.name,
      slug: tenant.slug,
      tagline: resolveTenantTagline(tenant.tagline),
      logo: tenant.logo,
    };
  },
};
