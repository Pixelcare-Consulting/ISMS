import { notFound } from "next/navigation";

import {
  AI_ASSISTANT_DENIED_MESSAGE,
  AI_ASSISTANT_OFF_MESSAGE,
  AI_ASSISTANT_UNAVAILABLE_MESSAGE,
} from "@/features/ai/constants/assistant-limits";
import { readAiAssistantGate } from "@/features/ai/services/assistant-policy.service";
import { evaluatePixelcareAiAccess } from "@/features/pixelcare-ai/constants/permissions";
import { getSession, requireAuth } from "@/lib/auth/permissions";
import type { AppSession } from "@/lib/auth/session";
import { logger } from "@/lib/shared/logger";

export type PixelcareAiDenialReason = "allowlist" | "policy" | "unavailable";

export type PixelcareAiPageAccess =
  | { ok: true; session: AppSession }
  | { ok: false; reason: PixelcareAiDenialReason; session: AppSession };

async function denyUnlessPolicy(
  session: AppSession,
): Promise<{ ok: true } | { ok: false; reason: "policy" | "unavailable" }> {
  const policy = await readAiAssistantGate(session.user.tenantId);
  if (policy.ok) return { ok: true };
  logger.info({ reason: policy.reason }, "pixelcare-ai.policy.denied");
  if (policy.reason === "unreadable") return { ok: false, reason: "unavailable" };
  return { ok: false, reason: "policy" };
}

/**
 * Page gate: optional allowlist, then the tenant assistant policy.
 * Sample mode does not bypass the policy.
 */
export async function resolvePixelcareAiPageAccess(): Promise<PixelcareAiPageAccess> {
  const session = await requireAuth();
  const result = evaluatePixelcareAiAccess({
    userId: session.user.id,
    email: session.user.email,
    permissions: session.user.permissions,
  });

  if (!result.ok) {
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

  const policy = await denyUnlessPolicy(session);
  if (!policy.ok) {
    return { ok: false, reason: policy.reason, session };
  }

  return { ok: true, session };
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
  { ok: true; session: AppSession } | { ok: false; status: 401 | 403 | 503; error: string }
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

  if (!result.ok) {
    const reason: "allowlist" = result.reason;
    switch (reason) {
      case "allowlist":
        return {
          ok: false,
          status: 403,
          error: AI_ASSISTANT_DENIED_MESSAGE,
        };
      default: {
        const _exhaustive: never = reason;
        return { ok: false, status: 403, error: `Pixelcare AI access denied (${_exhaustive}).` };
      }
    }
  }

  const policy = await denyUnlessPolicy(session);
  if (!policy.ok) {
    switch (policy.reason) {
      case "unavailable":
        return { ok: false, status: 503, error: AI_ASSISTANT_UNAVAILABLE_MESSAGE };
      case "policy":
        return { ok: false, status: 403, error: AI_ASSISTANT_OFF_MESSAGE };
      default: {
        const _exhaustive: never = policy.reason;
        return { ok: false, status: 403, error: `Pixelcare AI access denied (${_exhaustive}).` };
      }
    }
  }

  return { ok: true, session };
}
