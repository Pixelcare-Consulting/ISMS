import { cache } from "react";
import { redirect } from "next/navigation";

import {
  isPlatformOperator as hasPlatformOperatorRole,
  PROVIDER_ONLY_ROLE_SLUGS,
} from "@/features/roles/constants/role.constants";
import { auth, signOutServer } from "@/lib/auth";
import { prisma } from "@/lib/database/client";
import { toAppSession, type AppSession } from "@/lib/auth/session";

export async function resolveIsPlatformOperator(userId: string): Promise<boolean> {
  const match = await prisma.userRole.findFirst({
    where: {
      userId,
      role: {
        slug: { in: Array.from(PROVIDER_ONLY_ROLE_SLUGS) },
        deletedAt: null,
      },
    },
    select: { id: true },
  });

  return match !== null;
}

export async function resolveSessionPlatformOperator(user: {
  id: string;
  roleSlugs?: string[];
  isPlatformOperator?: boolean;
}): Promise<boolean> {
  if (user.isPlatformOperator) {
    return true;
  }

  if (user.roleSlugs?.length) {
    return hasPlatformOperatorRole(user.roleSlugs);
  }

  return resolveIsPlatformOperator(user.id);
}

export async function getSession() {
  return toAppSession(await auth());
}

async function sessionUserExists(session: AppSession): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: {
      id: session.user.id,
      tenantId: session.user.tenantId,
      deletedAt: null,
    },
    select: { id: true },
  });
  return user !== null;
}

/** Deduped per RSC request — layout, page, and server actions share one auth check. */
const getRequiredSession = cache(async (): Promise<AppSession> => {
  const session = toAppSession(await auth());
  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.id || !session.user.tenantId) {
    await signOutServer({ redirectTo: "/login?error=session-expired" });
  }

  const exists = await sessionUserExists(session);
  if (!exists) {
    await signOutServer({ redirectTo: "/login?error=session-expired" });
  }

  return session;
});

export async function requireAuth(): Promise<AppSession> {
  return getRequiredSession();
}

export async function requirePermission(permission: string): Promise<AppSession> {
  const session = await requireAuth();
  const permissions = session.user.permissions ?? [];
  if (!permissions.includes(permission)) {
    redirect("/dashboard?error=forbidden");
  }
  return session;
}

export async function requireAnyPermission(required: string[]): Promise<AppSession> {
  const session = await requireAuth();
  const permissions = session.user.permissions ?? [];
  if (!required.some((permission) => permissions.includes(permission))) {
    redirect("/dashboard?error=forbidden");
  }
  return session;
}

export async function requirePlatformOperator(): Promise<AppSession> {
  const session = await requireAuth();
  const isPlatformOperator = await resolveSessionPlatformOperator(session.user);

  if (!isPlatformOperator) {
    redirect("/dashboard?error=forbidden");
  }

  return session;
}

export function hasPermission(
  permissions: string[] | undefined,
  permission: string,
) {
  return permissions?.includes(permission) ?? false;
}

export function canAccessPolicies(permissions: string[] | undefined) {
  return (
    hasPermission(permissions, "policies.view") ||
    hasPermission(permissions, "policies.create") ||
    hasPermission(permissions, "policies.approve")
  );
}

export function canManagePolicies(permissions: string[] | undefined) {
  return (
    hasPermission(permissions, "policies.create") ||
    hasPermission(permissions, "policies.approve")
  );
}

export function canViewPolicy(
  policy: { status: string },
  permissions: string[] | undefined,
) {
  if (canManagePolicies(permissions)) {
    return true;
  }
  return (
    hasPermission(permissions, "policies.view") && policy.status === "approved"
  );
}

export async function requirePolicyAccess(): Promise<AppSession> {
  const session = await requireAuth();
  if (!canAccessPolicies(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }
  return session;
}

export function canManageCompanySettings(
  permissions: string[] | undefined,
  isPlatformOperator: boolean,
) {
  return isPlatformOperator || hasPermission(permissions, "company.manage");
}

export async function requireCompanyManage(): Promise<AppSession> {
  const session = await requireAuth();
  const isPlatformOperator = await resolveSessionPlatformOperator(session.user);

  if (!canManageCompanySettings(session.user.permissions, isPlatformOperator)) {
    redirect("/dashboard?error=forbidden");
  }

  return session;
}

export function canViewPlanogram(permissions: string[] | undefined) {
  return (
    hasPermission(permissions, "planogram.view") ||
    hasPermission(permissions, "planogram.manage")
  );
}

export function canManagePlanogram(permissions: string[] | undefined) {
  return hasPermission(permissions, "planogram.manage");
}

export async function requirePlanogramView(): Promise<AppSession> {
  const session = await requireAuth();
  if (!canViewPlanogram(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }
  return session;
}
