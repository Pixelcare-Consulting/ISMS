import type { AuthSession } from "@/lib/auth/auth";

/** App session shape used by RBAC helpers (matches prior NextAuth session.user). */
export type AppSession = {
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
    tenantId: string;
    permissions: string[];
    roleSlugs: string[];
    isPlatformOperator: boolean;
  };
};

export function toAppSession(session: AuthSession | null): AppSession | null {
  if (!session?.user) return null;
  const user = session.user as AuthSession["user"] & {
    tenantId?: string;
    permissions?: string[];
    roleSlugs?: string[];
    isPlatformOperator?: boolean;
  };

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      tenantId: user.tenantId ?? "",
      permissions: user.permissions ?? [],
      roleSlugs: user.roleSlugs ?? [],
      isPlatformOperator: Boolean(user.isPlatformOperator),
    },
  };
}
