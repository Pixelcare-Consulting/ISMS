"use server";

import {
  getSession,
  resolveSessionPlatformOperator,
} from "@/lib/auth/permissions";

function safeInternalPath(callbackUrl: string | null | undefined): string | null {
  if (!callbackUrl) return null;
  if (!callbackUrl.startsWith("/") || callbackUrl.startsWith("//")) {
    return null;
  }
  return callbackUrl;
}

/**
 * Resolves where to send the user after a successful email/password sign-in.
 * Platform operators land on `/provider` (callback only honored under `/provider`).
 */
export async function getPostLoginRedirectAction(
  callbackUrl?: string | null,
): Promise<string> {
  const session = await getSession();
  if (!session?.user) {
    return "/login";
  }

  const isPlatformOperator = await resolveSessionPlatformOperator(session.user);
  const safeCallback = safeInternalPath(callbackUrl);

  if (isPlatformOperator) {
    if (safeCallback?.startsWith("/provider")) {
      return safeCallback;
    }
    return "/provider";
  }

  return safeCallback ?? "/dashboard";
}
