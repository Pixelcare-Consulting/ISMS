import type { AuthSession } from "@/lib/auth/auth";

/** App session shape used by RBAC helpers (matches prior NextAuth session.user). */
export type AppSession = {
  /** Better Auth session row. Empty when a caller only has the user. */
  sessionId?: string;
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
    tenantId: string;
    permissions: string[];
    roleSlugs: string[];
    isPlatformOperator: boolean;
    mustChangePassword: boolean;
  };
};

export function toAppSession(session: AuthSession | null): AppSession | null {
  if (!session?.user) return null;
  const user = session.user as AuthSession["user"] & {
    tenantId?: string;
    permissions?: string[];
    roleSlugs?: string[];
    isPlatformOperator?: boolean;
    mustChangePassword?: boolean;
  };

  const sessionId =
    session && "session" in session && session.session
      ? session.session.id
      : "";

  return {
    sessionId,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      tenantId: user.tenantId ?? "",
      permissions: user.permissions ?? [],
      roleSlugs: user.roleSlugs ?? [],
      isPlatformOperator: Boolean(user.isPlatformOperator),
      mustChangePassword: Boolean(user.mustChangePassword),
    },
  };
}
