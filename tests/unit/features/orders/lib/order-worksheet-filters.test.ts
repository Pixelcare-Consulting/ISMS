import {
  paginateWorksheetLines,
  requestedLinesFirst,
  visibleWorksheetLines,
  worksheetLineHasQty,
  WORKSHEET_PAGE_SIZE,
  worksheetOrderTotals,
  worksheetRequestedFooter,
  type WorksheetFilterableLine,
} from "@/features/orders/lib/order-worksheet-filters";

interface StoredLine extends WorksheetFilterableLine {
  modelId: string;
  remarks: string;
  spRemarks: string;
  approvedQty: number | null;
  srp: number;
  cbm: number;
}

const stored: StoredLine[] = [
  {
    modelId: "alpha",
    skuCode: "TV-1",
    name: "Alpha Screen",
    brandId: "sony",
    requestedQty: 4,
    remarks: "keep this remark",
    spRemarks: "sp note",
    approvedQty: 2,
    srp: 100,
    cbm: 0.25,
  },
  {
    modelId: "beta",
    skuCode: "TV-2",
    name: "Beta Screen",
    brandId: "lg",
    requestedQty: 0,
    remarks: "hidden remark stays",
    spRemarks: "also stays",
    approvedQty: null,
    srp: 50,
    cbm: 0.1,
  },
];

describe("visibleWorksheetLines", () => {
  it("hides rows without dropping stored quantities, remarks, or totals", () => {
    const before = worksheetOrderTotals(stored, { includeApproved: true });
    const visible = visibleWorksheetLines(stored, {
      orderedOnly: true,
      modelSearch: "alpha",
      brandId: "sony",
    });

    expect(visible).toHaveLength(1);
    expect(visible[0]).toBe(stored[0]);
    expect(stored[0]?.requestedQty).toBe(4);
    expect(stored[0]?.remarks).toBe("keep this remark");
    expect(stored[0]?.spRemarks).toBe("sp note");
    expect(stored[1]?.requestedQty).toBe(0);
    expect(stored[1]?.remarks).toBe("hidden remark stays");
    expect(stored[1]?.spRemarks).toBe("also stays");
    expect(worksheetOrderTotals(stored, { includeApproved: true })).toEqual(before);
    expect(before).toEqual({
      requestedAmount: 400,
      requestedCbm: 1,
      approvedAmount: 200,
      approvedCbm: 0.5,
    });
  });

  it("keeps a zero-quantity row in the stored list when the search hides it", () => {
    const visible = visibleWorksheetLines(stored, {
      orderedOnly: false,
      modelSearch: "missing",
      brandId: "",
    });

    expect(visible).toEqual([]);
    expect(stored.map((line) => line.requestedQty)).toEqual([4, 0]);
    expect(stored.map((line) => line.remarks)).toEqual([
      "keep this remark",
      "hidden remark stays",
    ]);
  });
});

describe("worksheetRequestedFooter", () => {
  it("counts only lines with a requested quantity and sums those quantities", () => {
    expect(
      worksheetRequestedFooter([
        { requestedQty: 0 },
        { requestedQty: 2 },
        { requestedQty: 1 },
      ]),
    ).toEqual({ lineCount: 2, quantity: 3 });
  });
});

describe("paginateWorksheetLines", () => {
  const lines = Array.from({ length: 12 }, (_, index) => index + 1);

  it("keeps the page size at 10 and starts page 2 at row 11", () => {
    expect(WORKSHEET_PAGE_SIZE).toBe(10);
    const first = paginateWorksheetLines(lines, 1);
    const second = paginateWorksheetLines(lines, 2);
    expect(first.rows).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(first.indexOffset).toBe(0);
    expect(second.rows).toEqual([11, 12]);
    expect(second.indexOffset).toBe(10);
    expect(second.indexOffset + 1).toBe(11);
    expect(second.total).toBe(12);
  });
});

describe("Supply Planning approvals beyond the request", () => {
  const line = (requestedQty: number, approvedQty: number | null) => ({
    modelId: `m-${requestedQty}-${approvedQty}`,
    skuCode: "SKU",
    name: "Model",
    brandId: "b1",
    requestedQty,
    approvedQty,
    srp: 100,
    cbm: 2,
  });

  it("totals approved CBM as approved qty times each line's CBM, including unrequested lines", () => {
    const totals = worksheetOrderTotals([line(3, 3), line(1, 0), line(0, 2), line(0, null)], {
      includeApproved: true,
    });
    expect(totals.requestedCbm).toBe(8);
    expect(totals.approvedCbm).toBe(10);
    expect(totals.approvedAmount).toBe(500);
  });

  it("keeps a row approved without a request under 'with a quantity'", () => {
    const visible = visibleWorksheetLines([line(0, 2), line(0, null)], {
      orderedOnly: true,
      modelSearch: "",
      brandId: "",
    });
    expect(visible.map((row) => row.approvedQty)).toEqual([2]);
  });

  it("lists requested models first and keeps sheet order inside each group", () => {
    const rows = [line(0, null), line(2, 2), line(0, 1), line(1, 1)];
    const sections = requestedLinesFirst(rows);
    expect(sections.rows).toEqual([rows[1], rows[3], rows[0], rows[2]]);
    expect(sections.requestedCount).toBe(2);
    expect(sections.otherCount).toBe(2);
  });

  it("groups by the request, so changing the approved qty does not move a row", () => {
    const before = requestedLinesFirst([line(3, 3), line(0, null)]);
    const after = requestedLinesFirst([line(3, 0), line(0, 5)]);
    expect(after.rows.map((row) => row.requestedQty)).toEqual(
      before.rows.map((row) => row.requestedQty),
    );
  });

  it("treats requested rows and rows given an approved qty as having a quantity", () => {
    expect(worksheetLineHasQty(line(3, 0))).toBe(true);
    expect(worksheetLineHasQty(line(0, 2))).toBe(true);
    expect(worksheetLineHasQty(line(0, 0))).toBe(false);
    expect(worksheetLineHasQty(line(0, null))).toBe(false);
  });
});
