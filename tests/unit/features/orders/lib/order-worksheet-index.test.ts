import { visibleWorksheetLines } from "@/features/orders/lib/order-worksheet-filters";
import {
  projectWorksheetLines,
  worksheetIndexNo,
  type WorksheetDraftInput,
} from "@/features/orders/lib/order-worksheet-rows";
import type { OrderWorksheetLine } from "@/features/orders/types/order-analytics";

const draft = (requestedQty: number): WorksheetDraftInput => ({
  requestedQty,
  remarks: "",
  approvedQty: null,
  spRemarks: "",
  additionalItem: false,
});

function stub(modelId: string): OrderWorksheetLine {
  return {
    modelId,
    skuCode: modelId,
    name: modelId,
    brandId: "brand",
    brandName: "Brand",
    modelStatus: "active",
    origin: "planogram",
    newlyOrderable: true,
    onPlanogram: true,
    matchesBrandFilter: true,
    shelfMax: 4,
    srp: 10,
    cbm: 0.1,
    inventory: {
      onHandQty: 0,
      availableToSellQty: 0,
      defectiveQty: 0,
      awaitingPulloutQty: 0,
      transitIncomingQty: 0,
      transitOutgoingQty: 0,
      transitUnclassifiedQty: 0,
      ditQty: 0,
      byStatus: [],
    },
    salesQty: 0,
    salesAmount: 0,
    salesUnavailable: false,
    sugQty: 4,
    suggestionUnavailableReason: null,
    incomingQty: 1,
    outstandingOrderQty: 0,
  };
}

describe("worksheet index", () => {
  it("uses a real index when the line has one", () => {
    expect(worksheetIndexNo({ indexNo: 12, sheetIndex: 2 })).toBe(12);
  });

  it("keeps the unfiltered row number when a line has no index", () => {
    const rows = projectWorksheetLines(
      [stub("a"), stub("b"), stub("c")],
      { a: draft(0), b: draft(2), c: draft(0) },
      "manual",
      "readonly",
    );
    expect(rows.map((row) => worksheetIndexNo(row))).toEqual([1, 2, 3]);

    const visible = visibleWorksheetLines(rows, {
      orderedOnly: true,
      modelSearch: "",
      brandId: "",
    });
    expect(visible.map((row) => worksheetIndexNo(row))).toEqual([2]);
  });
});
