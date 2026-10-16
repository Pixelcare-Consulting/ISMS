import { aorService } from "@/features/aors/services/aor.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import {
  resolvePermittedBranchRef,
  type PermittedBranchRef,
} from "@/features/pixelcare-ai/lib/branch-resolve";
import { hasPermission } from "@/lib/auth/permissions";
import type { AppSession } from "@/lib/auth/session";

export type PermittedBranch = PermittedBranchRef;

export function isUnrestrictedBranchAccess(permissions: string[] | undefined): boolean {
  return (
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "aors.manage") ||
    hasPermission(permissions, "master_data.manage")
  );
}

export async function listPermittedBranches(session: AppSession): Promise<PermittedBranch[]> {
  const tenantId = session.user.tenantId;
  const unrestricted = isUnrestrictedBranchAccess(session.user.permissions);
  if (unrestricted) {
    const branches = await branchRepository.listByTenant(tenantId);
    return branches.map((b) => ({
      id: b.id,
      name: b.name,
      sapCode: b.sapCode,
    }));
  }
  const branchIds = await aorService.getBranchIdsForUser(tenantId, session.user.id);
  if (branchIds.length === 0) return [];
  const branches = await branchRepository.listByTenant(tenantId);
  return branches
    .filter((b) => branchIds.includes(b.id))
    .map((b) => ({
      id: b.id,
      name: b.name,
      sapCode: b.sapCode,
    }));
}

export async function assertPermittedBranch(
  session: AppSession,
  branchRef: string,
): Promise<
  | { ok: true; branch: PermittedBranch }
  | { ok: false; error: string }
> {
  const permitted = await listPermittedBranches(session);
  const branch = resolvePermittedBranchRef(permitted, branchRef);
  if (!branch) {
    if (permitted.length === 0) {
      return {
        ok: false,
        error:
          "You have no stores in your area of responsibility. Set a Context branch you can access, or ask an admin to assign branches to your AOR.",
      };
    }
    return {
      ok: false,
      error:
        "That store code or name was not found among your permitted stores. Call listPermittedBranches, or pick a Context branch you can access.",
    };
  }
  return { ok: true, branch };
}
