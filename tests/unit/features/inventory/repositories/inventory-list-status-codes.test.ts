jest.mock("@/lib/database/client", () => ({ prisma: {} }));
jest.mock("@/features/inventory/repositories/inventory-group.repository", () => ({
  inventoryGroupRepository: {},
}));

import {
  ALL_SERIALS_STATUS_CODES,
  SELLABLE_STOCK_STATUS_CODES,
} from "@/features/inventory/repositories/inventory.repository";

describe("inventory list status scope", () => {
  it("shows STK, DU, and DEF on All serials and counts only STK as stock", () => {
    expect([...ALL_SERIALS_STATUS_CODES]).toEqual(["STK", "DU", "DEF"]);
    expect([...SELLABLE_STOCK_STATUS_CODES]).toEqual(["STK"]);
  });
});
