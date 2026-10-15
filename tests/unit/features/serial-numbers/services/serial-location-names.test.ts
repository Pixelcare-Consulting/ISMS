jest.mock("@/lib/database/client", () => ({ prisma: {} }));
jest.mock("@/features/sap/services/sap-service-layer.service", () => ({
  sapServiceLayerService: { getCredentials: jest.fn() },
}));
jest.mock("@/features/sap/services/sap-service-layer-client", () => ({
  sapServiceLayerClient: { request: jest.fn() },
}));

import { applyWarehouseNames } from "@/features/serial-numbers/services/serial-location-names";

describe("applyWarehouseNames", () => {
  it("fills a missing name and leaves a branch name in place", () => {
    const items = applyWarehouseNames(
      [
        { branchCode: "FWH08CLB", branchName: null },
        { branchCode: "ABV004", branchName: "ABENSON CAINTA 2" },
        { branchCode: null, branchName: null },
      ],
      new Map([["FWH08CLB", "CLASS B WAREHOUSE"]]),
    );

    expect(items).toEqual([
      { branchCode: "FWH08CLB", branchName: "CLASS B WAREHOUSE" },
      { branchCode: "ABV004", branchName: "ABENSON CAINTA 2" },
      { branchCode: null, branchName: null },
    ]);
  });
});
