import {
  parseSapSalesOrder,
  planSapSalesOrderImport,
  sapSalesOrderNumber,
  type SapSalesOrder,
  type SapSalesOrderLookups,
} from "@/features/orders/services/sap-sales-order-import.planner";

/** SO 97557 as SAP returned it (a central-warehouse SO for branch ELG004), trimmed. */
const RAW_SO = {
  DocEntry: 94001,
  DocNum: 97557,
  DocDate: "2026-05-06T00:00:00Z",
  DocDueDate: "2026-05-10T00:00:00Z",
  CardCode: "CELG1000",
  Comments: " Rush ",
  DocumentStatus: "bost_Open",
  DocumentLines: [
    { LineNum: 0, ItemCode: "65UHD205", Quantity: 2, WarehouseCode: "FWH14P1F", CostingCode2: "ELG004" },
    { LineNum: 1, ItemCode: "43STV105", Quantity: 1, WarehouseCode: "FWH14P1F", CostingCode2: "ELG004" },
  ],
};

const LOOKUPS: SapSalesOrderLookups = {
  branchIdBySapCode: new Map([
    ["ELG004", "branch-elg004"],
    ["ELG011", "branch-elg011"],
  ]),
  warehouseIdByCode: new Map([["FWH14P1F", "wh-main"]]),
  modelBySku: new Map([
    ["65UHD205", { id: "m-65", brandId: "brand-a" }],
    ["43STV105", { id: "m-43", brandId: "brand-a" }],
    ["SONIQUE VIBE 301", { id: "m-sv", brandId: "brand-b" }],
  ]),
};

function so(over: Partial<SapSalesOrder> = {}): SapSalesOrder {
  const parsed = parseSapSalesOrder(RAW_SO);
  if (!parsed) throw new Error("fixture did not parse");
  return { ...parsed, ...over };
}

describe("parseSapSalesOrder", () => {
  it("reads the header, open status and each line's warehouse and Branch dimension", () => {
    expect(so()).toEqual({
      docEntry: 94001,
      docNum: 97557,
      docDate: "2026-05-06",
      dueDate: "2026-05-10",
      cardCode: "CELG1000",
      comments: "Rush",
      open: true,
      lines: [
        { lineNum: 0, itemCode: "65UHD205", quantity: 2, warehouseCode: "FWH14P1F", branchCode: "ELG004" },
        { lineNum: 1, itemCode: "43STV105", quantity: 1, warehouseCode: "FWH14P1F", branchCode: "ELG004" },
      ],
    });
  });

  it("reads a closed SO as not open and refuses a row without DocEntry", () => {
    expect(parseSapSalesOrder({ ...RAW_SO, DocumentStatus: "bost_Close" })?.open).toBe(false);
    expect(parseSapSalesOrder({ DocNum: 1 })).toBeNull();
  });
});

describe("planSapSalesOrderImport", () => {
  it("imports a central-warehouse SO for an ISMS branch as one order with the SO's lines", () => {
    expect(planSapSalesOrderImport(so(), LOOKUPS)).toEqual({
      import: true,
      plan: {
        orderNumber: "SAP-SO-97557",
        branchId: "branch-elg004",
        sourceWarehouseId: "wh-main",
        brandId: "brand-a",
        lines: [
          { modelId: "m-65", quantity: 2, sapLineNum: 0 },
          { modelId: "m-43", quantity: 1, sapLineNum: 1 },
        ],
      },
    });
  });

  it("skips a branch selling from its own SAP warehouse", () => {
    const own = so({
      lines: [{ lineNum: 0, itemCode: "65UHD205", quantity: 1, warehouseCode: "ELG011", branchCode: "ELG011" }],
    });
    expect(planSapSalesOrderImport(own, LOOKUPS)).toEqual({
      import: false,
      reason: "SO 97557 ships from ELG011, not an ISMS warehouse",
    });
  });

  it("skips an SO whose Branch is not an ISMS branch, or that names two branches", () => {
    const unknown = so({ lines: so().lines.map((line) => ({ ...line, branchCode: "XYZ001" })) });
    expect(planSapSalesOrderImport(unknown, LOOKUPS)).toMatchObject({ import: false });
    const mixed = so({
      lines: [so().lines[0]!, { ...so().lines[1]!, branchCode: "ELG011" }],
    });
    expect(planSapSalesOrderImport(mixed, LOOKUPS)).toEqual({
      import: false,
      reason: "SO 97557 names more than one Branch",
    });
  });

  it("skips an SO with an item ISMS does not know or a fractional quantity", () => {
    const unknownItem = so({ lines: [{ ...so().lines[0]!, itemCode: "NOPE" }] });
    expect(planSapSalesOrderImport(unknownItem, LOOKUPS)).toEqual({
      import: false,
      reason: "SO 97557: item NOPE is not an ISMS model",
    });
    const fractional = so({ lines: [{ ...so().lines[0]!, quantity: 1.5 }] });
    expect(planSapSalesOrderImport(fractional, LOOKUPS)).toMatchObject({ import: false });
  });

  it("keeps no brand when the SO mixes brands", () => {
    const mixed = so({ lines: [so().lines[0]!, { ...so().lines[1]!, itemCode: "SONIQUE VIBE 301" }] });
    const decision = planSapSalesOrderImport(mixed, LOOKUPS);
    expect(decision.import && decision.plan.brandId).toBeNull();
  });

  it("numbers imported orders after the SAP DocNum", () => {
    expect(sapSalesOrderNumber(97557)).toBe("SAP-SO-97557");
  });
});
