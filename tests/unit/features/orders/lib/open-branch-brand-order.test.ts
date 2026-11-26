import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

import {
  BLOCKING_BRANCH_ORDER_TYPES,
  isOpenBranchOrderStatus,
  OPEN_BRANCH_ORDER_STATUSES,
  openBranchBrandOrderWhere,
} from "@/features/orders/lib/open-branch-brand-order";

const ALL_STATUSES: BranchOrderStatus[] = [
  "draft",
  "pending_ps",
  "pending_tl",
  "pending_sp",
  "pending_logistics",
  "approved",
  "rejected",
  "cancelled",
];

const ALL_ORDER_TYPES: BranchOrderType[] = ["auto_replenish", "manual", "special"];

describe("open branch and brand order lookup", () => {
  it("treats in-progress statuses as blocking and approved, rejected, and cancelled as not", () => {
    const blocking = ALL_STATUSES.filter((status) => isOpenBranchOrderStatus(status));
    const finished = ALL_STATUSES.filter((status) => !isOpenBranchOrderStatus(status));

    expect(blocking).toEqual([...OPEN_BRANCH_ORDER_STATUSES]);
    expect(finished).toEqual(["approved", "rejected", "cancelled"]);

    const where = openBranchBrandOrderWhere("tenant-1", "branch-1", "brand-devant");
    expect(where.status).toEqual({ in: blocking });
    expect(where.status.in).not.toEqual(expect.arrayContaining(finished));
  });

  it("counts auto replenish, manual, and special orders for that branch and brand", () => {
    const where = openBranchBrandOrderWhere("tenant-1", "branch-1", "brand-devant");

    expect(where.orderType).toEqual({ in: [...ALL_ORDER_TYPES] });
    expect(where.orderType.in).toEqual([...BLOCKING_BRANCH_ORDER_TYPES]);
    expect(where.branchId).toBe("branch-1");
    expect(where.OR).toEqual([
      { brandId: "brand-devant" },
      { details: { some: { model: { brandId: "brand-devant" } } } },
    ]);
  });
});
