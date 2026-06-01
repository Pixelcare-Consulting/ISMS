import { aorRepository } from "@/features/aors/repositories/aor.repository";

export async function getUserBranchIds(tenantId: string, userId: string): Promise<string[] | null> {
  const aors = await aorRepository.listBranchIdsForUser(tenantId, userId);

  if (aors.length === 0) {
    return null;
  }

  return [...new Set(aors.map((a) => a.branchId).filter((id): id is string => !!id))];
}

export function branchScopeFilter(
  branchIds: string[] | null,
): { branchId?: { in: string[] } } | Record<string, never> {
  if (!branchIds || branchIds.length === 0) {
    return {};
  }
  return { branchId: { in: branchIds } };
}
