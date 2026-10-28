/**
 * Accounts created by `pnpm run db:seed` (see database/seed-users.md).
 *
 * Sign-in is rate-limited to 5 attempts per IP + email per 5 minutes
 * (src/lib/auth/auth.ts), so each spec that performs a login uses a
 * different account. The stored session (auth.setup.ts) belongs to `admin`;
 * everything that just needs to be signed in should rely on that instead of
 * logging in again.
 */
const password = process.env.E2E_USER_PASSWORD ?? "DemoPass123";

export const E2E_USERS = {
  /** Session stored by auth.setup.ts and reused by every authenticated spec. */
  admin: { email: process.env.E2E_USER_EMAIL ?? "admin@demo.local", password },
  /**
   * Not a setup admin, so sign-in follows callbackUrl. A tenant super admin
   * always lands on /setup instead (resolvePostLoginDestination).
   */
  deptHead: { email: "depthead@demo.local", password },
  ismsManager: { email: "isms@demo.local", password },
  auditor: { email: "auditor@demo.local", password },
} as const;
