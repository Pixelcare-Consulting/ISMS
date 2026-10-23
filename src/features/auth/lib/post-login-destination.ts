import {
  SETUP_HOME,
  isSetupPathAllowed,
  isTenantSetupAdmin,
} from "@/features/roles/constants/setup-access";

/** Only same-origin app paths — never protocol-relative or off-site URLs. */
export function safeInternalPath(
  callbackUrl: string | null | undefined,
): string | null {
  if (!callbackUrl) return null;
  if (!callbackUrl.startsWith("/") || callbackUrl.startsWith("//")) {
    return null;
  }
  return callbackUrl;
}

/** Path only, so a query or hash does not hide an allowed setup screen. */
function callbackPathname(callback: string): string {
  const path = callback.split(/[?#]/, 1)[0] ?? callback;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * Where to send the user after email/password sign-in.
 * Platform operators always land in the provider console unless the callback
 * is already under `/provider`. A tenant super admin lands on Setup, and a
 * callback is kept only when that account may open it.
 */
export function resolvePostLoginDestination(input: {
  isPlatformOperator: boolean;
  roleSlugs?: string[];
  callbackUrl?: string | null;
}): string {
  const safeCallback = safeInternalPath(input.callbackUrl);

  if (input.isPlatformOperator) {
    if (safeCallback?.startsWith("/provider")) {
      return safeCallback;
    }
    return "/provider";
  }

  if (
    isTenantSetupAdmin({
      roleSlugs: input.roleSlugs,
      isPlatformOperator: input.isPlatformOperator,
    })
  ) {
    if (safeCallback && isSetupPathAllowed(callbackPathname(safeCallback))) {
      return safeCallback;
    }
    return SETUP_HOME;
  }

  return safeCallback ?? "/dashboard";
}

/**
 * Poll until `read` returns a value. Used after client sign-in, when the
 * browser may not have committed Set-Cookie before the next request.
 */
export async function waitForValue<T>(
  read: () => Promise<T | null | undefined>,
  delaysMs: readonly number[] = [0, 40, 80, 160],
): Promise<T | null> {
  for (const delayMs of delaysMs) {
    if (delayMs > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
    const value = await read();
    if (value) return value;
  }
  return null;
}
