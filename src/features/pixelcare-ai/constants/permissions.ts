export const PIXELCARE_AI_PERMISSION = "ai.internal";

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

/**
 * Optional staging lockdown. Empty / unset = every authenticated user may use
 * Pixelcare AI when `PIXELCARE_AI_ENABLED=true`. Non-empty = only matching
 * user ids or emails (case-insensitive), unless the user has `ai.internal`.
 */
export function parsePixelcareAiUserAllowlist(
  raw: string | undefined = process.env.PIXELCARE_AI_USER_IDS,
): string[] {
  return (raw ?? "")
    .split(",")
    .map((id) => stripWrappingQuotes(id.trim()))
    .filter(Boolean);
}

export function isPixelcareAiEnabled(
  flag: string | undefined = process.env.PIXELCARE_AI_ENABLED,
): boolean {
  return flag?.trim() === "true";
}

export function isPixelcareAiSampleMode(
  flag: string | undefined = process.env.PIXELCARE_AI_SAMPLE_MODE,
): boolean {
  return flag?.trim() === "true";
}

function allowlistMatches(
  allowlist: string[],
  candidates: Array<string | null | undefined>,
): boolean {
  const normalized = new Set(
    allowlist.map((entry) => entry.trim().toLowerCase()).filter(Boolean),
  );
  for (const candidate of candidates) {
    const value = candidate?.trim().toLowerCase();
    if (value && normalized.has(value)) return true;
  }
  return false;
}

export type PixelcareAiAccessReason =
  | "ok"
  | "disabled"
  | "allowlist";

/**
 * Access rules (fail closed on the kill switch):
 * 1. `PIXELCARE_AI_ENABLED` must be `true`
 * 2. Caller must already be authenticated (enforced by access helpers)
 * 3. Empty allowlist → all authenticated users
 * 4. Non-empty allowlist → match user id/email, or hold `ai.internal`
 */
export function evaluatePixelcareAiAccess(input: {
  userId: string;
  email?: string | null;
  permissions: string[] | undefined;
  enabled?: boolean;
  allowlist?: string[];
}): { ok: true; reason: "ok" } | { ok: false; reason: Exclude<PixelcareAiAccessReason, "ok"> } {
  const enabled = input.enabled ?? isPixelcareAiEnabled();
  if (!enabled) return { ok: false, reason: "disabled" };

  const allowlist = input.allowlist ?? parsePixelcareAiUserAllowlist();
  if (allowlist.length === 0) return { ok: true, reason: "ok" };

  const permissions = input.permissions ?? [];
  if (permissions.includes(PIXELCARE_AI_PERMISSION)) {
    return { ok: true, reason: "ok" };
  }

  if (allowlistMatches(allowlist, [input.userId, input.email])) {
    return { ok: true, reason: "ok" };
  }

  return { ok: false, reason: "allowlist" };
}

export function canUsePixelcareAi(input: {
  userId: string;
  email?: string | null;
  permissions: string[] | undefined;
  enabled?: boolean;
  allowlist?: string[];
}): boolean {
  return evaluatePixelcareAiAccess(input).ok;
}
