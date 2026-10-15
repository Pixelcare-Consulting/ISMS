jest.mock("@/lib/database/client", () => ({ prisma: {} }));
jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: {},
}));
jest.mock("@/features/inventory/repositories/inventory.repository", () => ({
  inventoryRepository: {},
}));
jest.mock("@/features/serial-numbers/repositories/serial-number.repository", () => ({
  serialNumberRepository: {},
}));
jest.mock("@/features/serial-numbers/services/serial-location-names", () => ({
  applyWarehouseNames: jest.fn(),
  loadWarehouseNames: jest.fn(),
  warehouseCodesMissingNames: jest.fn(),
}));

import { stockUnitsBranchHref } from "@/features/serial-numbers/services/serial-number.service";

describe("stockUnitsBranchHref", () => {
  it("passes branch id (not display name) as the Stock units filter", () => {
    expect(stockUnitsBranchHref("branch-cuid-mag026")).toBe(
      "/inventory?branch=branch-cuid-mag026",
    );
  });

  it("URL-encodes the branch id when needed", () => {
    expect(stockUnitsBranchHref("id with space")).toBe(
      "/inventory?branch=id%20with%20space",
    );
  });
});
