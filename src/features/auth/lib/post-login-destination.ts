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

/**
 * Where to send the user after email/password sign-in.
 * Platform operators always land in the provider console unless the callback
 * is already under `/provider`.
 */
export function resolvePostLoginDestination(input: {
  isPlatformOperator: boolean;
  callbackUrl?: string | null;
}): string {
  const safeCallback = safeInternalPath(input.callbackUrl);

  if (input.isPlatformOperator) {
    if (safeCallback?.startsWith("/provider")) {
      return safeCallback;
    }
    return "/provider";
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
