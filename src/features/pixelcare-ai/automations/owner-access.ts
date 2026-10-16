import { evaluatePixelcareAiAccess } from "@/features/pixelcare-ai/constants/permissions";
import {
  hasAnyOrderPermission,
  hasOrderPermission,
} from "@/features/orders/constants/order-permissions";
import { REPLENISHMENT_ORDER_TYPE } from "@/features/pixelcare-ai/automations/proposal-lines";
import { hasPermission } from "@/lib/auth/permissions";
import { getUserBranchIds } from "@/lib/aor/scope";
import { prisma } from "@/lib/database/client";

export class AutomationAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutomationAccessError";
  }
}

export type OwnerAccess = {
  userId: string;
  tenantId: string;
  email: string | null;
  permissions: string[];
  roleSlugs: string[];
  /** `null` means no AOR rows, which order create treats as unrestricted. */
  aorBranchIds: string[] | null;
  fullOrderAccess: boolean;
  pixelcare: boolean;
};

export async function loadOwnerAccess(tenantId: string, userId: string): Promise<OwnerAccess> {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId, deletedAt: null },
    select: { id: true, email: true },
  });
  if (!user) {
    throw new AutomationAccessError("The automation owner no longer has access. Nothing was saved.");
  }

  const [permissions, roleSlugs, aorBranchIds] = await Promise.all([
    loadPermissionSlugs(userId),
    loadRoleSlugs(userId),
    getUserBranchIds(tenantId, userId),
  ]);

  const pixelcare = evaluatePixelcareAiAccess({
    userId,
    email: user.email,
    permissions,
  }).ok;

  return {
    userId,
    tenantId,
    email: user.email,
    permissions,
    roleSlugs,
    aorBranchIds,
    fullOrderAccess:
      hasAnyOrderPermission(permissions, "approve") ||
      hasPermission(permissions, "branches.manage"),
    pixelcare,
  };
}

async function loadPermissionSlugs(userId: string): Promise<string[]> {
  const permissions = await prisma.permission.findMany({
    where: {
      rolePermissions: {
        some: { role: { userRoles: { some: { userId } } } },
      },
    },
    select: { slug: true },
  });
  return Array.from(new Set(permissions.map((permission) => permission.slug)));
}

async function loadRoleSlugs(userId: string): Promise<string[]> {
  const roles = await prisma.role.findMany({
    where: { userRoles: { some: { userId } } },
    select: { slug: true },
  });
  return roles.map((role) => role.slug);
}

/** Same branch rule `orderService.create` applies when `hasFullAccess` is false. */
export function branchIsAllowed(access: OwnerAccess, branchId: string): boolean {
  if (access.fullOrderAccess) return true;
  if (access.aorBranchIds === null) return true;
  return access.aorBranchIds.includes(branchId);
}

export function resolveScopedBranches(requested: readonly string[], access: OwnerAccess): string[] {
  if (!access.pixelcare) {
    throw new AutomationAccessError(
      "Pixelcare access for this automation owner is no longer allowed. Nothing was saved.",
    );
  }
  if (requested.length === 0) {
    throw new AutomationAccessError("Choose at least one branch. Nothing was saved.");
  }
  const denied = requested.filter((branchId) => !branchIsAllowed(access, branchId));
  if (denied.length > 0) {
    throw new AutomationAccessError(
      "Branch access was lost for this automation. Nothing was saved.",
    );
  }
  return [...requested];
}

export function assertCanCreateReplenishment(access: OwnerAccess): void {
  if (!access.pixelcare) {
    throw new AutomationAccessError(
      "Pixelcare access for this automation owner is no longer allowed. Nothing was saved.",
    );
  }
  if (!hasOrderPermission(access.permissions, REPLENISHMENT_ORDER_TYPE, "create")) {
    throw new AutomationAccessError(
      "Auto replenish create permission was lost. Nothing was saved.",
    );
  }
}

export function assertCanReadBriefing(access: OwnerAccess): void {
  if (!access.pixelcare) {
    throw new AutomationAccessError(
      "Pixelcare access for this automation owner is no longer allowed. Nothing was saved.",
    );
  }
  const canSeeGaps =
    hasPermission(access.permissions, "planogram.view") ||
    hasPermission(access.permissions, "planogram.manage") ||
    hasAnyOrderPermission(access.permissions, "view");
  if (!canSeeGaps || !hasAnyOrderPermission(access.permissions, "view")) {
    throw new AutomationAccessError(
      "Permission to read shelf gaps or orders was lost. Nothing was saved.",
    );
  }
}

export function assertCanReadReminders(access: OwnerAccess): void {
  if (!access.pixelcare) {
    throw new AutomationAccessError(
      "Pixelcare access for this automation owner is no longer allowed. Nothing was saved.",
    );
  }
  if (!hasAnyOrderPermission(access.permissions, "view")) {
    throw new AutomationAccessError("Order view permission was lost. Nothing was saved.");
  }
}
