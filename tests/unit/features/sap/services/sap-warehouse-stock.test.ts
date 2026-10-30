jest.mock("@/features/sap/services/sap-service-layer-client", () => ({
  sapServiceLayerClient: { request: jest.fn() },
}));

import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import { fetchSapWarehouseItemStock } from "@/features/sap/services/sap-warehouse-stock";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";

const request = sapServiceLayerClient.request as jest.Mock;
const creds = {} as SapServiceLayerCredentials;
const row = (itemCode: string, inStock: number, committed: number) => ({
  Items: { ItemCode: itemCode },
  "Items/ItemWarehouseInfoCollection": { InStock: inStock, Committed: committed },
});

describe("fetchSapWarehouseItemStock", () => {
  beforeEach(() => request.mockReset());

  it("filters on the warehouse in SAP and follows paging", async () => {
    request
      .mockResolvedValueOnce({
        statusCode: 200,
        rawBody: "",
        data: { value: [row("A", 10, 3)], "odata.nextLink": "$crossjoin(Items)?$skip=20" },
      })
      .mockResolvedValueOnce({ statusCode: 200, rawBody: "", data: { value: [row("B", 2, 5)] } });

    const stock = await fetchSapWarehouseItemStock(creds, "FWH'14");

    expect(request.mock.calls[0][0].path).toContain("WarehouseCode%20eq%20%27FWH%27%2714%27");
    expect(request.mock.calls[1][0].path).toBe("/$crossjoin(Items)?$skip=20");
    expect(stock).toEqual([
      { itemCode: "A", inStock: 10, committed: 3, available: 7 },
      { itemCode: "B", inStock: 2, committed: 5, available: 0 },
    ]);
  });

  it("surfaces SAP's error", async () => {
    request.mockResolvedValueOnce({
      statusCode: 400,
      rawBody: JSON.stringify({ error: { message: { value: "Invalid filter" } } }),
      data: null,
    });
    await expect(fetchSapWarehouseItemStock(creds, "X")).rejects.toThrow("Invalid filter");
  });
});
