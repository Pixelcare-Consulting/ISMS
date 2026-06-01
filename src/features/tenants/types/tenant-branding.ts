export const DEFAULT_TENANT_TAGLINE = "Secure your information assets";

export interface TenantBranding {
  name: string;
  tagline: string;
  slug: string;
  logo: string | null;
}

export function resolveTenantTagline(tagline: string | null | undefined): string {
  const trimmed = tagline?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_TENANT_TAGLINE;
}
