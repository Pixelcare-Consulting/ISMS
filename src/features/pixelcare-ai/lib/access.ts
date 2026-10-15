import { notFound } from "next/navigation";

import { evaluatePixelcareAiAccess } from "@/features/pixelcare-ai/constants/permissions";
import { getSession, requireAuth } from "@/lib/auth/permissions";
import type { AppSession } from "@/lib/auth/session";
import { logger } from "@/lib/shared/logger";

export type PixelcareAiPageAccess =
  | { ok: true; session: AppSession }
  | { ok: false; reason: "allowlist"; session: AppSession };

/**
 * Page gate: kill switch → 404 (feature hidden). Optional allowlist miss →
 * structured denial so the UI can explain why (still fail closed).
 */
export async function resolvePixelcareAiPageAccess(): Promise<PixelcareAiPageAccess> {
  const session = await requireAuth();
  const result = evaluatePixelcareAiAccess({
    userId: session.user.id,
    email: session.user.email,
    permissions: session.user.permissions,
  });

  if (result.ok) {
    return { ok: true, session };
  }

  if (result.reason === "disabled") {
    notFound();
  }

  logger.info(
    {
      reason: result.reason,
      hasEmail: Boolean(session.user.email),
      allowlistConfigured: true,
    },
    "pixelcare-ai.access.denied",
  );

  return { ok: false, reason: "allowlist", session };
}

/** Throws notFound on any denial. Prefer resolvePixelcareAiPageAccess for pages. */
export async function requirePixelcareAiAccess(): Promise<AppSession> {
  const access = await resolvePixelcareAiPageAccess();
  if (!access.ok) {
    notFound();
  }
  return access.session;
}

export async function requirePixelcareAiApiAccess(): Promise<
  { ok: true; session: AppSession } | { ok: false; status: 401 | 403; error: string }
> {
  const session = await getSession();
  if (!session?.user?.id || !session.user.tenantId) {
    return { ok: false, status: 401, error: "Authentication required." };
  }

  const result = evaluatePixelcareAiAccess({
    userId: session.user.id,
    email: session.user.email,
    permissions: session.user.permissions,
  });

  if (result.ok) {
    return { ok: true, session };
  }

  switch (result.reason) {
    case "disabled":
      return { ok: false, status: 403, error: "Pixelcare AI is disabled." };
    case "allowlist":
      return {
        ok: false,
        status: 403,
        error:
          "Pixelcare AI allowlist does not include this account. Clear PIXELCARE_AI_USER_IDS or add your user id/email.",
      };
    default: {
      const _exhaustive: never = result;
      return { ok: false, status: 403, error: `Pixelcare AI access denied (${_exhaustive}).` };
    }
  }
}
