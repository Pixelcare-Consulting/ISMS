import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth as betterAuth, type AuthSession } from "@/lib/auth/auth";
import { logger } from "@/lib/shared/logger";

/** Server-side session (Better Auth). Replaces Auth.js `auth()`. */
export async function getAuthSession(): Promise<AuthSession | null> {
  return betterAuth.api.getSession({
    headers: await headers(),
  });
}

/** Drop-in for previous NextAuth `auth()`. */
export async function auth(): Promise<AuthSession | null> {
  return getAuthSession();
}

export async function signOutServer(options: { redirectTo: string }): Promise<never>;
export async function signOutServer(options?: { redirectTo?: string }): Promise<void>;
export async function signOutServer(options?: { redirectTo?: string }): Promise<void> {
  try {
    await betterAuth.api.signOut({
      headers: await headers(),
    });
  } catch (error) {
    // A missing or idle row can fail the cookie clear. Still leave the page,
    // or the leftover cookie bounces the browser between the app and login.
    logger.warn({ err: error }, "sign-out did not finish; continuing to the login page");
  }
  if (options?.redirectTo) {
    redirect(options.redirectTo);
  }
}
