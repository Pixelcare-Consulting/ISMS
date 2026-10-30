jest.mock("@/lib/database/client", () => ({ prisma: {} }));
jest.mock("@/features/sap/services/sap-service-layer.service", () => ({ sapServiceLayerService: {} }));
jest.mock("@/features/sap/services/sap-warehouse-stock", () => ({}));

import { assertWithinWarehouseStock } from "@/features/service-center-ordering/services/sc-order-worksheet";

const worksheet = {
  warehouseCode: "FWH14P1F",
  skippedItemCount: 0,
  lines: [
    { modelId: "m1", skuCode: "55UHD206", name: "TV", brandId: null, brandName: null, available: 5 },
  ],
};

describe("assertWithinWarehouseStock", () => {
  it("accepts up to what is available", () => {
    expect(() => assertWithinWarehouseStock(worksheet, [{ modelId: "m1", quantity: 5 }])).not.toThrow();
  });

  it("refuses more than is available", () => {
    expect(() => assertWithinWarehouseStock(worksheet, [{ modelId: "m1", quantity: 6 }])).toThrow(
      "55UHD206: only 5 available in FWH14P1F.",
    );
  });

  it("refuses a model the warehouse doesn't have", () => {
    expect(() => assertWithinWarehouseStock(worksheet, [{ modelId: "m2", quantity: 1 }])).toThrow(
      "A model on this order has no stock available in FWH14P1F.",
    );
  });
});
