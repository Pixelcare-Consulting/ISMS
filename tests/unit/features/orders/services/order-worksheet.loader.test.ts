jest.mock("@/lib/database/client", () => ({
  prisma: {
    branch: { findFirst: jest.fn() },
    productModel: { findMany: jest.fn() },
    branchPlanogram: { findMany: jest.fn() },
    branchInventory: { findMany: jest.fn() },
    branchPulloutLine: { findMany: jest.fn() },
    branchTransferLine: { findMany: jest.fn() },
    branchDeliveryLine: { findMany: jest.fn() },
    branchOrderDetail: { findMany: jest.fn() },
    branchSalesTransactionDetail: { findMany: jest.fn() },
    branchQuota: { findMany: jest.fn() },
  },
}));

jest.mock("@/features/planogram/repositories/planogram.repository", () => ({
  planogramRepository: {
    listPlanogramModelsForAnalytics: jest.fn(),
    listMilByBranch: jest.fn(),
  },
}));

jest.mock("@/features/reason-status/repositories/reason-status.repository", () => ({
  reasonStatusRepository: {
    listActiveCodesByCategory: jest.fn(),
  },
}));

import { planogramRepository } from "@/features/planogram/repositories/planogram.repository";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { orderAnalyticsService } from "@/features/orders/services/order-analytics.service";
import { NO_SALES_DII_REASON, OFF_PLANOGRAM_SUGGESTION_REASON } from "@/features/orders/types/order-analytics";
import { prisma } from "@/lib/database/client";

const NOW = new Date("2026-10-19T02:00:00.000Z");

function planogramModel(input: {
  id: string;
  sku: string;
  name: string;
  brandId: string;
  brandName: string;
  maxQty: number;
}) {
  return {
    maxQty: input.maxQty,
    model: {
      id: input.id,
      skuCode: input.sku,
      name: input.name,
      srp: 100,
      cbm: 0.2,
      brandId: input.brandId,
      brand: { id: input.brandId, name: input.brandName },
      priceLists: [],
    },
  };
}

function resetDb() {
  (prisma.branch.findFirst as jest.Mock).mockResolvedValue({
    id: "branch-1",
    name: "Ayala Cebu",
    dealerId: "dealer-1",
    dealer: { id: "dealer-1", name: "North Dealer" },
  });
  (planogramRepository.listPlanogramModelsForAnalytics as jest.Mock).mockResolvedValue([]);
  (planogramRepository.listMilByBranch as jest.Mock).mockResolvedValue([]);
  (reasonStatusRepository.listActiveCodesByCategory as jest.Mock).mockResolvedValue([]);
  (prisma.branchQuota.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.productModel.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.branchPlanogram.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.branchInventory.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.branchPulloutLine.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.branchTransferLine.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.branchDeliveryLine.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.branchOrderDetail.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.branchSalesTransactionDetail.findMany as jest.Mock).mockResolvedValue([]);
}

describe("loadOrderWorksheet", () => {
  beforeEach(() => {
    resetDb();
  });

  it("loads one branch sheet in batched queries", async () => {
    (planogramRepository.listPlanogramModelsForAnalytics as jest.Mock).mockResolvedValue([
      planogramModel({
        id: "m-zero",
        sku: "SKU-ZERO",
        name: "Empty shelf",
        brandId: "brand-1",
        brandName: "Sony",
        maxQty: 3,
      }),
      planogramModel({
        id: "m-stk",
        sku: "SKU-STK",
        name: "On hand",
        brandId: "brand-1",
        brandName: "Sony",
        maxQty: 5,
      }),
      planogramModel({
        id: "m-out",
        sku: "SKU-OUT",
        name: "Leaving",
        brandId: "brand-1",
        brandName: "Sony",
        maxQty: 2,
      }),
      planogramModel({
        id: "m-def",
        sku: "SKU-DEF",
        name: "Defective",
        brandId: "brand-1",
        brandName: "Sony",
        maxQty: 1,
      }),
      planogramModel({
        id: "m-in",
        sku: "SKU-IN",
        name: "Arriving",
        brandId: "brand-1",
        brandName: "Sony",
        maxQty: 4,
      }),
    ]);
    (prisma.productModel.findMany as jest.Mock).mockResolvedValue([
      {
        id: "m-hist",
        skuCode: "SKU-HIST",
        name: "Old model",
        status: "hold",
        srp: 80,
        cbm: 0.1,
        brandId: "brand-9",
        brand: { id: "brand-9", name: "Legacy" },
        priceLists: [],
      },
    ]);
    (prisma.branchInventory.findMany as jest.Mock).mockResolvedValue([
      {
        serialNumberId: "stk-ok",
        statusCode: { code: "STK" },
        serialNumber: { modelId: "m-stk" },
        defectReports: [],
      },
      {
        serialNumberId: "stk-hold",
        statusCode: { code: "STK" },
        serialNumber: { modelId: "m-stk" },
        defectReports: [{ id: "defect-1" }],
      },
      {
        serialNumberId: "s-out",
        statusCode: { code: "DIT" },
        serialNumber: { modelId: "m-out" },
        defectReports: [],
      },
      {
        serialNumberId: "s-def",
        statusCode: { code: "DEF" },
        serialNumber: { modelId: "m-def" },
        defectReports: [],
      },
      {
        serialNumberId: "s-in",
        statusCode: { code: "DIT" },
        serialNumber: { modelId: "m-in" },
        defectReports: [],
      },
    ]);
    (prisma.branchPulloutLine.findMany as jest.Mock).mockResolvedValue([
      {
        serialNumberId: "s-def",
        serialNumber: { modelId: "m-def" },
        pullout: { statusCode: { code: "for_pullout" } },
      },
    ]);
    (prisma.branchTransferLine.findMany as jest.Mock).mockResolvedValue([
      {
        serialNumberId: "s-out",
        transfer: { fromBranchId: "branch-1", toBranchId: "branch-2" },
      },
    ]);
    (prisma.branchDeliveryLine.findMany as jest.Mock).mockResolvedValue([
      { serialNumberId: "s-out" },
      { serialNumberId: "s-in" },
    ]);
    (prisma.branchOrderDetail.findMany as jest.Mock).mockResolvedValue([
      {
        modelId: "m-in",
        quantity: 5,
        approvedQty: null,
        order: {
          deliveries: [
            {
              lines: [
                {
                  serialNumberId: "s-in",
                  serialNumber: {
                    modelId: "m-in",
                    branchInventories: [{ statusCode: { code: "DIT" } }],
                  },
                },
              ],
            },
          ],
        },
      },
    ]);

    const payload = await orderAnalyticsService.getWorksheet("tenant-1", {
      branchId: "branch-1",
      orderType: "manual",
      existingModelIds: ["m-hist", "m-hist"],
      excludeOrderId: "order-current",
      now: NOW,
    });

    const bySku = new Map(payload.lines.map((line) => [line.skuCode, line]));
    expect(bySku.get("SKU-ZERO")).toMatchObject({
      newlyOrderable: true,
      sugQty: 3,
      inventory: { onHandQty: 0 },
    });
    expect(bySku.get("SKU-HIST")).toMatchObject({
      origin: "historical_order_line",
      newlyOrderable: false,
      modelStatus: "hold",
      sugQty: null,
      suggestionUnavailableReason: OFF_PLANOGRAM_SUGGESTION_REASON,
    });
    expect(bySku.get("SKU-OUT")?.inventory).toMatchObject({
      transitOutgoingQty: 1,
      transitIncomingQty: 0,
      ditQty: 1,
    });
    expect(bySku.get("SKU-DEF")?.inventory).toMatchObject({
      defectiveQty: 1,
      awaitingPulloutQty: 1,
      onHandQty: 0,
    });
    expect(bySku.get("SKU-IN")).toMatchObject({
      sugQty: 4,
      incomingQty: 1,
      outstandingOrderQty: 4,
    });
    expect(bySku.get("SKU-STK")?.inventory).toMatchObject({
      onHandQty: 2,
      availableToSellQty: 1,
    });
    expect(bySku.get("SKU-STK")?.inventory).not.toHaveProperty("displayUnits");

    expect(payload.summary.salesAmount).toBe(0);
    expect(payload.summary.salesUnavailable).toBe(false);
    expect(payload.summary.computedDii).toBeNull();
    expect(payload.summary.diiUnavailableReason).toBe(NO_SALES_DII_REASON);
    expect(payload.summary.inventoryAmount).toBe(200);
    expect(payload.summary.branchScopeLabel).toBe("Ayala Cebu");
    expect(payload.summary.brandScopeLabel).toBe("All brands");
    expect(payload.summary.salesPeriodLabel).toBe("October 1\u201319, 2026 (Asia/Manila)");
    expect(payload.summary.inventoryAsOf).toBe(NOW.toISOString());
    expect(payload.dealerName).toBe("North Dealer");
    expect(payload.deliveryFrequencyCode).toBeNull();
    expect(payload.brandQuotas).toEqual([]);
    expect(bySku.get("SKU-ZERO")?.milDays).toBe(30);
    expect(prisma.branchQuota.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1",
          branchId: "branch-1",
          quotaDate: new Date(Date.UTC(2026, 9, 1)),
        }),
      }),
    );

    expect(prisma.branchInventory.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.branchPulloutLine.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.branchTransferLine.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.branchDeliveryLine.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.branchOrderDetail.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.branchSalesTransactionDetail.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.branchInventory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          defectReports: expect.objectContaining({
            where: { status: "pending_inspection" },
          }),
        }),
      }),
    );
    expect(prisma.branchOrderDetail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          order: expect.objectContaining({
            id: { not: "order-current" },
            status: { notIn: ["draft", "rejected", "cancelled"] },
          }),
        }),
      }),
    );
  });

  it("returns queried sales for an additional off-planogram model", async () => {
    (prisma.productModel.findMany as jest.Mock).mockResolvedValue([
      {
        id: "m-extra",
        skuCode: "SKU-EXTRA",
        name: "Additional item",
        status: "active",
        srp: 100,
        cbm: 0.1,
        brandId: "brand-9",
        brand: { id: "brand-9", name: "Legacy" },
        priceLists: [],
      },
    ]);
    (prisma.branchSalesTransactionDetail.findMany as jest.Mock).mockResolvedValue([
      {
        modelId: "m-extra",
        saleAmount: 150,
        amount: 150,
        modelPrice: 150,
        model: { id: "m-extra", srp: 100 },
      },
      {
        modelId: "m-extra",
        saleAmount: 150,
        amount: 150,
        modelPrice: 150,
        model: { id: "m-extra", srp: 100 },
      },
    ]);

    const payload = await orderAnalyticsService.getWorksheet("tenant-1", {
      branchId: "branch-1",
      orderType: "special",
      existingModelIds: ["m-extra"],
      now: NOW,
    });

    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0]).toMatchObject({
      modelId: "m-extra",
      modelStatus: "active",
      onPlanogram: false,
      origin: "historical_order_line",
      salesQty: 2,
      salesAmount: 300,
      salesUnavailable: false,
    });
    expect(prisma.branchSalesTransactionDetail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: [
                { modelId: { in: ["m-extra"] } },
                { model: { id: { in: ["m-extra"] } } },
              ],
            }),
          ]),
        }),
      }),
    );
  });

  it("marks additional-model sales unavailable when the sales query fails", async () => {
    (prisma.productModel.findMany as jest.Mock).mockResolvedValue([
      {
        id: "m-extra",
        skuCode: "SKU-EXTRA",
        name: "Additional item",
        status: "active",
        srp: 100,
        cbm: 0.1,
        brandId: "brand-9",
        brand: { id: "brand-9", name: "Legacy" },
        priceLists: [],
      },
    ]);
    (prisma.branchSalesTransactionDetail.findMany as jest.Mock).mockRejectedValue(
      new Error("sales down"),
    );

    const payload = await orderAnalyticsService.getWorksheet("tenant-1", {
      branchId: "branch-1",
      orderType: "special",
      existingModelIds: ["m-extra"],
      now: NOW,
    });

    expect(payload.lines[0]).toMatchObject({
      modelId: "m-extra",
      salesQty: null,
      salesAmount: null,
      salesUnavailable: true,
    });
    expect(payload.summary.salesQty).toBeNull();
    expect(payload.summary.salesAmount).toBeNull();
    expect(payload.summary.computedDii).toBeNull();
  });

  it("keeps a failed sales query unavailable instead of zero", async () => {
    (planogramRepository.listPlanogramModelsForAnalytics as jest.Mock).mockResolvedValue([
      planogramModel({
        id: "m1",
        sku: "SKU-1",
        name: "Model",
        brandId: "brand-1",
        brandName: "Sony",
        maxQty: 2,
      }),
    ]);
    (prisma.branchSalesTransactionDetail.findMany as jest.Mock).mockRejectedValue(
      new Error("sales down"),
    );

    const payload = await orderAnalyticsService.getWorksheet("tenant-1", {
      branchId: "branch-1",
      orderType: "special",
      now: NOW,
    });

    expect(payload.lines[0]?.salesUnavailable).toBe(true);
    expect(payload.lines[0]?.salesQty).toBeNull();
    expect(payload.lines[0]?.salesAmount).toBeNull();
    expect(payload.summary.salesAmount).toBeNull();
    expect(payload.summary.computedDii).toBeNull();
    expect(payload.summary.diiUnavailableReason).toBeNull();
  });

  it("keeps an order-line model outside the brand filter and drops other brands", async () => {
    (planogramRepository.listPlanogramModelsForAnalytics as jest.Mock).mockResolvedValue([
      planogramModel({
        id: "m-a",
        sku: "SKU-A",
        name: "Filtered",
        brandId: "brand-1",
        brandName: "Sony",
        maxQty: 1,
      }),
      planogramModel({
        id: "m-b",
        sku: "SKU-B",
        name: "On the order",
        brandId: "brand-2",
        brandName: "Other",
        maxQty: 2,
      }),
      planogramModel({
        id: "m-c",
        sku: "SKU-C",
        name: "Hidden",
        brandId: "brand-2",
        brandName: "Other",
        maxQty: 2,
      }),
    ]);

    const payload = await orderAnalyticsService.getWorksheet("tenant-1", {
      branchId: "branch-1",
      brandId: "brand-1",
      orderType: "manual",
      existingModelIds: ["m-b"],
      now: NOW,
    });

    expect(payload.lines.map((line) => line.modelId).sort()).toEqual(["m-a", "m-b"]);
    expect(payload.summary.brandFiltered).toBe(true);
    expect(payload.summary.brandScopeLabel).toBe("Sony");
    expect(payload.summary.metricScopeLabel).toContain("includes models already on the order");
    expect(payload.summary.offBrandRowCount).toBe(1);
    expect(payload.lines.find((line) => line.modelId === "m-b")?.newlyOrderable).toBe(true);
    expect(prisma.productModel.findMany).not.toHaveBeenCalled();
  });

  it("loads delivery frequency, the current-month quota, MIL days, and status colors", async () => {
    (prisma.branch.findFirst as jest.Mock).mockResolvedValue({
      id: "branch-1",
      name: "Ayala Cebu",
      dealerId: null,
      dealer: null,
      deliveryScheduleConfig: { frequencyCode: { code: "F4" } },
    });
    (planogramRepository.listPlanogramModelsForAnalytics as jest.Mock).mockResolvedValue([
      planogramModel({
        id: "m1",
        sku: "SKU-1",
        name: "Model",
        brandId: "brand-1",
        brandName: "Devant",
        maxQty: 2,
      }),
    ]);
    (planogramRepository.listMilByBranch as jest.Mock).mockResolvedValue([
      { modelId: "m1", daysThreshold: 14 },
    ]);
    (reasonStatusRepository.listActiveCodesByCategory as jest.Mock).mockResolvedValue([
      { code: "STK", color: "green" },
      { code: "DU", color: "amber" },
    ]);
    (prisma.branchQuota.findMany as jest.Mock).mockResolvedValue([
      { brandId: "brand-1", quotaAmount: 40 },
    ]);
    (prisma.branchInventory.findMany as jest.Mock).mockResolvedValue([
      {
        serialNumberId: "du-1",
        statusCode: { code: "DU" },
        serialNumber: { modelId: "m1" },
        defectReports: [],
      },
    ]);

    const payload = await orderAnalyticsService.getWorksheet("tenant-1", {
      branchId: "branch-1",
      orderType: "manual",
      now: NOW,
    });

    expect(payload.deliveryFrequencyCode).toBe("F4");
    expect(payload.brandQuotas).toEqual([{ brandId: "brand-1", quantity: 40 }]);
    expect(payload.lines[0]?.milDays).toBe(14);
    expect(payload.lines[0]?.inventory.byStatus).toEqual(
      expect.arrayContaining([
        { code: "STK", count: 0, color: "green" },
        { code: "DU", count: 1, color: "amber" },
      ]),
    );
    expect(reasonStatusRepository.listActiveCodesByCategory).toHaveBeenCalledWith(
      "tenant-1",
      "inventory_system",
    );
  });

  it("rejects an unknown branch", async () => {
    (prisma.branch.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      orderAnalyticsService.getWorksheet("tenant-1", {
        branchId: "missing",
        orderType: "manual",
      }),
    ).rejects.toThrow("Branch not found");
  });
});
