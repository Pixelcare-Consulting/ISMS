jest.mock("@/lib/database/client", () => ({
  prisma: {
    branchOrder: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { suggestedOrderService } from "@/features/forecast/services/suggested-order.service";
import { prisma } from "@/lib/database/client";

const branchOrderCreate = prisma.branchOrder.create as jest.Mock;

describe("suggested orders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not create shelf-gap auto-replenish drafts", async () => {
    await expect(
      suggestedOrderService.generateSuggestedOrders("tenant-1", "period-1", "user-1"),
    ).rejects.toThrow(
      "Shelf-gap drafts are no longer generated here. Auto replenish suggestions come from a released Supply Planning run via Suggested Orders.",
    );
    expect(branchOrderCreate).not.toHaveBeenCalled();
    expect(prisma.branchOrder.findFirst).not.toHaveBeenCalled();
  });

  it("does not bulk-submit tenant drafts", async () => {
    await expect(
      suggestedOrderService.submitDraftOrdersForReview("tenant-1", "user-1"),
    ).rejects.toThrow(/no longer submitted from here/);
    expect(prisma.branchOrder.findMany).not.toHaveBeenCalled();
    expect(branchOrderCreate).not.toHaveBeenCalled();
  });
});
