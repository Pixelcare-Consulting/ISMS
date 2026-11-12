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

/** Printed slips have room for an address line and a phone/fax line, plus one spare. */
export const DOCUMENT_HEADER_MAX_LINES = 3;
export const DOCUMENT_HEADER_MAX_LENGTH = 400;

/** Trimmed, non-blank lines of the Company Settings document header. */
export function splitDocumentHeader(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
