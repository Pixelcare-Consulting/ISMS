import { aorRepository } from "@/features/aors/repositories/aor.repository";
import { isBranchScopeUnrestricted } from "@/features/logistics/services/logistics-posting-access";
import type { PostingActor } from "@/features/logistics/services/posting-support";

/**
 * Deliveries are visible to a user whose AOR covers the destination branch or
 * the source warehouse. A user with no AOR rows is unrestricted, matching
 * orders and transfers.
 */
export async function authorizeDeliveryScope(
  actor: PostingActor,
  delivery: { branchId: string; sourceWarehouseId: string | null },
): Promise<void> {
  if (isBranchScopeUnrestricted(actor.permissions)) return;

  const scope = await aorRepository.listScopeForUser(actor.tenantId, actor.userId);
  if (!scope.hasRows) return;

  const inBranch = scope.branchIds.includes(delivery.branchId);
  const inWarehouse =
    delivery.sourceWarehouseId !== null && scope.warehouseIds.includes(delivery.sourceWarehouseId);
  if (!inBranch && !inWarehouse) {
    throw new Error("This delivery is outside your area of responsibility");
  }
}
