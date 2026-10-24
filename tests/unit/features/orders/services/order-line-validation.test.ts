jest.mock("@/features/master-data/repositories/master-data.repository", () => ({
  masterDataRepository: {
    findModel: jest.fn(),
  },
}));

jest.mock("@/features/planogram/repositories/planogram.repository", () => ({
  planogramRepository: {
    findPlanogramEntry: jest.fn(),
    countStockForModel: jest.fn(),
  },
}));

import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { planogramRepository } from "@/features/planogram/repositories/planogram.repository";
import { validateOrderLines } from "@/features/orders/services/order-line-validation";

const findModel = masterDataRepository.findModel as jest.Mock;
const findPlanogramEntry = planogramRepository.findPlanogramEntry as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("validateOrderLines", () => {
  it("rejects a zero-quantity context row before anything is saved", async () => {
    await expect(
      validateOrderLines("tenant-1", "branch-1", "manual", [
        { modelId: "m-context", quantity: 0 },
      ]),
    ).rejects.toThrow("Quantity must be at least 1");

    expect(findModel).not.toHaveBeenCalled();
    expect(findPlanogramEntry).not.toHaveBeenCalled();
  });

  it("rejects a manual create for an off-planogram model", async () => {
    findModel.mockResolvedValue({ skuCode: "SKU-OFF", status: "active" });
    findPlanogramEntry.mockResolvedValue(null);

    await expect(
      validateOrderLines("tenant-1", "branch-1", "manual", [
        { modelId: "m-off", quantity: 1 },
      ]),
    ).rejects.toThrow(
      "SKU SKU-OFF is not on the branch planogram. Use a special order for off-planogram SKUs.",
    );
  });

  it("accepts an active off-planogram model on a special order", async () => {
    findModel.mockResolvedValue({ skuCode: "SKU-OFF", status: "active" });

    await expect(
      validateOrderLines("tenant-1", "branch-1", "special", [
        { modelId: "m-off", quantity: 2 },
      ]),
    ).resolves.toBeUndefined();

    expect(findPlanogramEntry).not.toHaveBeenCalled();
    expect(planogramRepository.countStockForModel).not.toHaveBeenCalled();
  });
});
