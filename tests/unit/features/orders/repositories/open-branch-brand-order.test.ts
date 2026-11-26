jest.mock("@/lib/database/client", () => ({
  prisma: {
    branchOrder: { findFirst: jest.fn() },
    brand: { findFirst: jest.fn() },
  },
}));

import type { BranchOrderStatus } from "@prisma/client";

import { orderRepository } from "@/features/orders/repositories/order.repository";
import {
  isOpenBranchOrderStatus,
  openBranchBrandOrderWhere,
} from "@/features/orders/lib/open-branch-brand-order";
import { prisma } from "@/lib/database/client";

const findOrder = prisma.branchOrder.findFirst as jest.Mock;
const findBrand = prisma.brand.findFirst as jest.Mock;

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

describe("orderRepository.findOpenOrderForBranchBrand", () => {
  beforeEach(() => {
    findOrder.mockReset();
    findBrand.mockReset();
  });

  it("looks up in-progress orders of every type, and skips approved, rejected, and cancelled", async () => {
    findOrder.mockResolvedValue({
      orderNumber: "SO-1001",
      orderType: "auto_replenish",
      branch: { name: "Makati" },
      brand: null,
    });
    findBrand.mockResolvedValue({ name: "Devant" });

    await expect(
      orderRepository.findOpenOrderForBranchBrand("tenant-1", "branch-1", "brand-devant"),
    ).resolves.toEqual({
      orderNumber: "SO-1001",
      orderType: "auto_replenish",
      branchName: "Makati",
      brandName: "Devant",
    });

    const where = openBranchBrandOrderWhere("tenant-1", "branch-1", "brand-devant");
    expect(findOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: { createdAt: "desc" },
      }),
    );

    const queried = findOrder.mock.calls[0]?.[0].where as {
      status: { in: BranchOrderStatus[] };
      orderType: { in: string[] };
    };
    expect(queried.status.in.filter((status) => isOpenBranchOrderStatus(status))).toEqual(
      queried.status.in,
    );
    expect(queried.status.in).not.toEqual(
      expect.arrayContaining(
        ALL_STATUSES.filter((status) => !isOpenBranchOrderStatus(status)),
      ),
    );
    expect(queried.orderType.in).toEqual(["auto_replenish", "manual", "special"]);
    expect(findBrand).toHaveBeenCalledWith({
      where: { id: "brand-devant", tenantId: "tenant-1" },
      select: { name: true },
    });
  });

  it("returns nothing when no in-progress order matches", async () => {
    findOrder.mockResolvedValue(null);

    await expect(
      orderRepository.findOpenOrderForBranchBrand("tenant-1", "branch-1", "brand-devant"),
    ).resolves.toBeNull();
    expect(findBrand).not.toHaveBeenCalled();
  });
});
