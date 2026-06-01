import { unstable_cache } from "next/cache";

import { profileService } from "@/features/settings/services/profile.service";
import { tenantService } from "@/features/tenants/services/tenant.service";
import { resolveTenantTagline } from "@/features/tenants/types/tenant-branding";

export function getCachedLayoutBranding(tenantId: string) {
  return unstable_cache(
    async () => {
      const tenant = await tenantService.getById(tenantId);
      return {
        name: tenant?.name ?? "ISMS",
        tagline: resolveTenantTagline(tenant?.tagline),
        logo: tenant?.logo ?? null,
      };
    },
    [`layout-branding-${tenantId}`],
    { revalidate: 120, tags: [`tenant-branding-${tenantId}`] },
  )();
}

export function getCachedLayoutProfile(tenantId: string, userId: string) {
  return unstable_cache(
    async () => {
      const profile = await profileService.getProfile(tenantId, userId);
      return {
        name: profile.name,
        image: profile.image,
      };
    },
    [`layout-profile-${tenantId}-${userId}`],
    { revalidate: 60, tags: [`user-profile-${userId}`] },
  )();
}
