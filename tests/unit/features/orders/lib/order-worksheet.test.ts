import {
  assembleOrderWorksheet,
  classifyWorksheetInventory,
  formatWorksheetSalesPeriodLabel,
  isAwaitingPulloutWorkflow,
  outstandingQtyForLines,
  resolveDitDirection,
  worksheetDii,
  worksheetSuggestion,
  type WorksheetModelFact,
  type WorksheetSalesByModel,
} from "@/features/orders/lib/order-worksheet";
import {
  NO_SALES_DII_REASON,
  OFF_PLANOGRAM_SUGGESTION_REASON,
} from "@/features/orders/types/order-analytics";
import type { ManilaMonthWindow } from "@/features/orders/utils/manila-calendar";

const window: ManilaMonthWindow = {
  year: 2026,
  month: 10,
  day: 19,
  daysElapsed: 10,
  start: new Date("2026-09-30T16:00:00.000Z"),
  endExclusive: new Date("2026-10-31T16:00:00.000Z"),
};

function model(
  overrides: Partial<WorksheetModelFact> & Pick<WorksheetModelFact, "modelId" | "skuCode">,
): WorksheetModelFact {
  return {
    name: overrides.skuCode,
    brandId: "brand-1",
    brandName: "Sony",
    modelStatus: "active",
    origin: "planogram",
    onPlanogram: true,
    shelfMax: 4,
    srp: 100,
    cbm: 0.1,
    ...overrides,
  };
}

function assemble(input: {
  models: WorksheetModelFact[];
  serials?: Parameters<typeof assembleOrderWorksheet>[0]["serials"];
  pullouts?: Parameters<typeof assembleOrderWorksheet>[0]["pullouts"];
  transfers?: Parameters<typeof assembleOrderWorksheet>[0]["transfers"];
  deliveriesIntoBranch?: Parameters<typeof assembleOrderWorksheet>[0]["deliveriesIntoBranch"];
  orderLines?: Parameters<typeof assembleOrderWorksheet>[0]["orderLines"];
  sales?: WorksheetSalesByModel;
  brandId?: string | null;
  brandName?: string | null;
  daysElapsed?: number;
}) {
  return assembleOrderWorksheet({
    branch: { id: "branch-1", name: "Ayala Cebu", dealerId: null, dealerName: null },
    orderType: "manual",
    brandId: input.brandId ?? null,
    brandName: input.brandName ?? null,
    brands: [{ id: "brand-1", name: "Sony" }],
    models: input.models,
    serials: input.serials ?? [],
    pullouts: input.pullouts ?? [],
    transfers: input.transfers ?? [],
    deliveriesIntoBranch: input.deliveriesIntoBranch ?? [],
    orderLines: input.orderLines ?? [],
    sales: input.sales ?? { unavailable: false, byModel: new Map() },
    window: { ...window, daysElapsed: input.daysElapsed ?? window.daysElapsed },
    inventoryAsOf: "2026-10-19T02:00:00.000Z",
  });
}

describe("worksheet suggestion and DII", () => {
  it("keeps a zero-stock planogram model and suggests the full shelf", () => {
    const payload = assemble({
      models: [model({ modelId: "m-zero", skuCode: "SKU-0", shelfMax: 3 })],
    });

    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0]).toMatchObject({
      modelId: "m-zero",
      newlyOrderable: true,
      onPlanogram: true,
      sugQty: 3,
      suggestionUnavailableReason: null,
      inventory: { onHandQty: 0 },
    });
  });

  it("does not subtract incoming or outstanding supply from SUG", () => {
    expect(
      worksheetSuggestion({ onPlanogram: true, shelfMax: 10, onHandQty: 2 }),
    ).toEqual({ sugQty: 8, suggestionUnavailableReason: null });

    const payload = assemble({
      models: [model({ modelId: "m1", skuCode: "SKU-1", shelfMax: 10 })],
      serials: [
        { serialNumberId: "stk", modelId: "m1", statusCode: "STK", pendingDefectInspection: false },
        { serialNumberId: "stk-2", modelId: "m1", statusCode: "STK", pendingDefectInspection: false },
        { serialNumberId: "dit", modelId: "m1", statusCode: "DIT", pendingDefectInspection: false },
      ],
      deliveriesIntoBranch: [{ serialNumberId: "dit" }],
      orderLines: [
        {
          modelId: "m1",
          lineQty: 4,
          serialsAlreadyStk: 0,
          linkedIncomingSerialIds: ["dit"],
        },
      ],
    });

    expect(payload.lines[0]?.sugQty).toBe(8);
    expect(payload.lines[0]?.incomingQty).toBe(1);
    expect(payload.lines[0]?.outstandingOrderQty).toBe(3);
  });

  it("marks off-planogram suggestions unavailable", () => {
    const suggestion = worksheetSuggestion({
      onPlanogram: false,
      shelfMax: 9,
      onHandQty: 1,
    });
    expect(suggestion).toEqual({
      sugQty: null,
      suggestionUnavailableReason: OFF_PLANOGRAM_SUGGESTION_REASON,
    });
    expect(OFF_PLANOGRAM_SUGGESTION_REASON).toBe("N/A\u2014outside planogram");
  });

  it("returns null DII with a reason when sales amount is zero", () => {
    const payload = assemble({
      models: [model({ modelId: "m1", skuCode: "SKU-1", shelfMax: 2, srp: 100 })],
      serials: [
        { serialNumberId: "s1", modelId: "m1", statusCode: "STK", pendingDefectInspection: false },
        { serialNumberId: "s2", modelId: "m1", statusCode: "STK", pendingDefectInspection: false },
      ],
      sales: { unavailable: false, byModel: new Map() },
      daysElapsed: 10,
    });

    expect(payload.summary.salesUnavailable).toBe(false);
    expect(payload.summary.salesAmount).toBe(0);
    expect(payload.summary.salesQty).toBe(0);
    expect(payload.summary.inventoryAmount).toBe(200);
    expect(payload.summary.computedDii).toBeNull();
    expect(payload.summary.diiUnavailableReason).toBe(NO_SALES_DII_REASON);
    expect(payload.summary.inventoryAmountBasis).toBe("on-hand-stk-times-active-order-price");
    expect(payload.lines[0]?.salesQty).toBe(0);
  });

  it("computes DII from stock value and Manila daily sales", () => {
    expect(
      worksheetDii({
        inventoryAmount: 200,
        salesAmount: 50,
        salesUnavailable: false,
        daysElapsed: 10,
      }),
    ).toEqual({ computedDii: 40, diiUnavailableReason: null });
  });

  it("does not invent zero sales when the query failed", () => {
    const payload = assemble({
      models: [model({ modelId: "m1", skuCode: "SKU-1" })],
      sales: { unavailable: true },
    });

    expect(payload.summary.salesUnavailable).toBe(true);
    expect(payload.summary.salesAmount).toBeNull();
    expect(payload.summary.salesQty).toBeNull();
    expect(payload.lines[0]?.salesQty).toBeNull();
    expect(payload.lines[0]?.salesAmount).toBeNull();
    expect(payload.summary.computedDii).toBeNull();
    expect(payload.summary.diiUnavailableReason).toBeNull();
    expect(payload.summary.diiUnavailableReason).not.toBe(NO_SALES_DII_REASON);
  });
});

describe("worksheet inventory classification", () => {
  it("counts on hand as STK only and keeps sellable stock separate", () => {
    const classified = classifyWorksheetInventory({
      modelIds: ["m1"],
      serials: [
        { serialNumberId: "a", modelId: "m1", statusCode: "STK", pendingDefectInspection: false },
        { serialNumberId: "b", modelId: "m1", statusCode: "STK", pendingDefectInspection: true },
        { serialNumberId: "c", modelId: "m1", statusCode: "RSV", pendingDefectInspection: false },
      ],
      pullouts: [],
      transfers: [],
      deliveriesIntoBranch: [],
    });
    const row = classified.get("m1");
    expect(row?.onHandQty).toBe(2);
    expect(row?.availableToSellQty).toBe(1);
    expect(row).not.toHaveProperty("displayUnits");
    expect(row?.byStatus).toEqual(
      expect.arrayContaining([
        { code: "STK", count: 2 },
        { code: "RSV", count: 1 },
      ]),
    );
  });

  it("does not count one serial twice", () => {
    const classified = classifyWorksheetInventory({
      modelIds: ["m1"],
      serials: [
        { serialNumberId: "a", modelId: "m1", statusCode: "STK", pendingDefectInspection: false },
        { serialNumberId: "a", modelId: "m1", statusCode: "STK", pendingDefectInspection: false },
      ],
      pullouts: [],
      transfers: [],
      deliveriesIntoBranch: [],
    });
    expect(classified.get("m1")?.onHandQty).toBe(1);
  });

  it("labels outbound DIT as outgoing even when a delivery also references it", () => {
    expect(
      resolveDitDirection({
        onInTransitPullout: false,
        transferLeaving: true,
        deliveryIntoBranch: true,
        transferEntering: true,
      }),
    ).toBe("outgoing");

    const classified = classifyWorksheetInventory({
      modelIds: ["m1"],
      serials: [
        { serialNumberId: "out", modelId: "m1", statusCode: "DIT", pendingDefectInspection: false },
      ],
      pullouts: [],
      transfers: [{ serialNumberId: "out", direction: "leaving" }],
      deliveriesIntoBranch: [{ serialNumberId: "out" }],
    });
    const row = classified.get("m1");
    expect(row?.transitOutgoingQty).toBe(1);
    expect(row?.transitIncomingQty).toBe(0);
    expect(row?.transitUnclassifiedQty).toBe(0);
    expect(row?.ditQty).toBe(1);
  });

  it("counts a delivery or inbound transfer as incoming and leaves other DIT unclassified", () => {
    const classified = classifyWorksheetInventory({
      modelIds: ["m1"],
      serials: [
        { serialNumberId: "in-d", modelId: "m1", statusCode: "DIT", pendingDefectInspection: false },
        { serialNumberId: "in-t", modelId: "m1", statusCode: "DIT", pendingDefectInspection: false },
        { serialNumberId: "loose", modelId: "m1", statusCode: "DIT", pendingDefectInspection: false },
      ],
      pullouts: [],
      transfers: [{ serialNumberId: "in-t", direction: "entering" }],
      deliveriesIntoBranch: [{ serialNumberId: "in-d" }],
    });
    const row = classified.get("m1");
    expect(row?.transitIncomingQty).toBe(2);
    expect(row?.transitOutgoingQty).toBe(0);
    expect(row?.transitUnclassifiedQty).toBe(1);
    expect(row?.ditQty).toBe(3);
  });

  it("counts a DEF serial on an active pull-out once in each bucket", () => {
    const classified = classifyWorksheetInventory({
      modelIds: ["m1"],
      serials: [
        { serialNumberId: "def", modelId: "m1", statusCode: "DEF", pendingDefectInspection: false },
      ],
      pullouts: [
        { serialNumberId: "def", modelId: "m1", workflowCode: "for_pullout" },
        { serialNumberId: "def", modelId: "m1", workflowCode: "pending_logistics" },
      ],
      transfers: [],
      deliveriesIntoBranch: [],
    });
    const row = classified.get("m1");
    expect(row?.defectiveQty).toBe(1);
    expect(row?.awaitingPulloutQty).toBe(1);
    expect(row?.onHandQty).toBe(0);
    expect(row?.defectiveQty).not.toBe(2);
  });

  it("does not treat closed or in-transit pull-outs as awaiting", () => {
    for (const workflowCode of ["cancelled", "completed", "pulled_out", "in_transit"]) {
      expect(isAwaitingPulloutWorkflow(workflowCode)).toBe(false);
    }
    expect(isAwaitingPulloutWorkflow("for_pullout")).toBe(true);

    const classified = classifyWorksheetInventory({
      modelIds: ["m1"],
      serials: [
        { serialNumberId: "leave", modelId: "m1", statusCode: "DIT", pendingDefectInspection: false },
      ],
      pullouts: [{ serialNumberId: "leave", modelId: "m1", workflowCode: "in_transit" }],
      transfers: [],
      deliveriesIntoBranch: [],
    });
    expect(classified.get("m1")).toMatchObject({
      awaitingPulloutQty: 0,
      transitOutgoingQty: 1,
      transitIncomingQty: 0,
      defectiveQty: 0,
    });
  });
});

describe("worksheet rows and outstanding supply", () => {
  it("includes a historical model and flags it not newly orderable", () => {
    const payload = assemble({
      models: [
        model({ modelId: "m-plan", skuCode: "SKU-A", shelfMax: 1 }),
        model({
          modelId: "m-old",
          skuCode: "SKU-OLD",
          modelStatus: "hold",
          origin: "historical_order_line",
          onPlanogram: false,
          shelfMax: null,
          brandId: "brand-2",
          brandName: "Other",
        }),
      ],
      brandId: "brand-1",
      brandName: "Sony",
    });

    const historical = payload.lines.find((line) => line.modelId === "m-old");
    expect(historical).toMatchObject({
      origin: "historical_order_line",
      newlyOrderable: false,
      onPlanogram: false,
      sugQty: null,
      suggestionUnavailableReason: OFF_PLANOGRAM_SUGGESTION_REASON,
      matchesBrandFilter: false,
    });
    expect(payload.lines.map((line) => line.modelId)).toEqual(["m-plan", "m-old"]);
    expect(payload.summary.brandFiltered).toBe(true);
    expect(payload.summary.branchScopeLabel).toBe("Ayala Cebu");
    expect(payload.summary.brandScopeLabel).toBe("Sony");
    expect(payload.summary.metricScopeLabel).toBe(
      "Ayala Cebu · Sony · includes models already on the order",
    );
    expect(payload.summary.offBrandRowCount).toBe(1);
    expect(payload.summary.includesHistoricalOrderLines).toBe(true);
    expect(payload.summary.salesPeriodLabel).toBe("October 1\u201319, 2026 (Asia/Manila)");
    expect(payload.summary.inventoryAsOf).toBe("2026-10-19T02:00:00.000Z");
    expect(payload.summary.salesTimeZone).toBe("Asia/Manila");
  });

  it("does not count an order and its linked incoming delivery twice", () => {
    expect(
      outstandingQtyForLines(
        [
          {
            lineQty: 5,
            serialsAlreadyStk: 2,
            linkedIncomingSerialIds: ["dit-1", "dit-1", "outbound"],
          },
        ],
        new Set(["dit-1"]),
      ),
    ).toBe(2);
  });

  it("formats the Manila sales window", () => {
    expect(formatWorksheetSalesPeriodLabel(window)).toBe(
      "October 1\u201319, 2026 (Asia/Manila)",
    );
  });
});
