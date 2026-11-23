/** No session activity for this long turns the account off. Super Admin is never included. */
export const ACCOUNT_IDLE_DISABLE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Newest session activity, or the account's created time when they never signed in.
 */
export function accountLastActivityAt(input: {
  createdAt: Date;
  lastActiveAt: Date | null;
}): Date {
  return input.lastActiveAt ?? input.createdAt;
}

/** True when this account should be turned off for a quiet stretch longer than 7 days. */
export function shouldAutoDisableAccount(input: {
  isSuperAdmin: boolean;
  createdAt: Date;
  lastActiveAt: Date | null;
  now: Date;
  idleMs?: number;
}): boolean {
  if (input.isSuperAdmin) return false;
  const idleMs = input.idleMs ?? ACCOUNT_IDLE_DISABLE_MS;
  const last = accountLastActivityAt(input);
  return input.now.getTime() - last.getTime() > idleMs;
}
