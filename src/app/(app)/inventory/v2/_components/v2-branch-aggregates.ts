import type { InventoryGroupBranchItemDto } from "@/features/inventory/actions/inventory.actions";
import {
  branchInventoryUnitTotal,
  statusCountByCode,
} from "@/features/inventory/utils/branch-inventory-v2";

export function aggregateBranchInventory(branches: readonly InventoryGroupBranchItemDto[]) {
  let totalUnits = 0;
  let stk = 0;
  let def = 0;
  let defectiveTotal = 0;

  for (const row of branches) {
    totalUnits += branchInventoryUnitTotal(row.counts);
    defectiveTotal += row.counts.defective;
    const statuses = row.counts.statuses ?? [];
    stk += statusCountByCode(statuses, "STK", "Stock").count;
    def += statusCountByCode(statuses, "DEF", "Defective").count;
  }

  return { totalUnits, stk, def, defectiveTotal, branchCount: branches.length };
}

export function aggregateOffPlanogram(
  offPlanogramBranches: readonly InventoryGroupBranchItemDto[],
): number {
  return offPlanogramBranches.reduce(
    (sum, row) => sum + branchInventoryUnitTotal(row.counts),
    0,
  );
}

export function topBranchByDefective(
  branches: readonly InventoryGroupBranchItemDto[],
): InventoryGroupBranchItemDto | null {
  return (
    [...branches]
      .filter((row) => row.counts.defective > 0)
      .sort((a, b) => b.counts.defective - a.counts.defective)[0] ?? null
  );
}

export function topOffPlanogramBranch(
  offPlanogramBranches: readonly InventoryGroupBranchItemDto[],
): InventoryGroupBranchItemDto | null {
  return (
    [...offPlanogramBranches].sort(
      (a, b) => branchInventoryUnitTotal(b.counts) - branchInventoryUnitTotal(a.counts),
    )[0] ?? null
  );
}
