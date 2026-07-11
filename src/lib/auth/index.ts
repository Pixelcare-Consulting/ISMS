import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth as betterAuth, type AuthSession } from "@/lib/auth/auth";

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

export async function signOutServer(options?: { redirectTo?: string }) {
  await betterAuth.api.signOut({
    headers: await headers(),
  });
  if (options?.redirectTo) {
    redirect(options.redirectTo);
  }
}
