import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      tenantId: string;
      permissions: string[];
      roleSlugs: string[];
      isPlatformOperator: boolean;
    };
  }

  interface User {
    tenantId: string;
    permissions: string[];
    roleSlugs: string[];
    isPlatformOperator: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    tenantId: string;
    permissions: string[];
    roleSlugs: string[];
    isPlatformOperator: boolean;
    name?: string | null;
  }
}
