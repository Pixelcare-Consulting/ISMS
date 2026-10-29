import type { CurrentPlacement } from "@/features/inventory/services/serial-placement";
import {
  checkFollowedDocument,
  deliveryStatusAfterFollow,
  parseFollowedDocument,
  placementsToReplace,
  type FollowedDocument,
} from "@/features/logistics/services/sap-copy-to-follow.planner";

/** IT 494398 as SAP returned it for ITR 372648 (DocEntry 368865), trimmed. */
const COPIED_IT = {
  DocEntry: 491349,
  DocNum: 494398,
  DocDate: "2026-10-27T00:00:00Z",
  U_ISMS_PO_No: "ITR#2026-10-89938",
  ToWarehouse: "ABL003",
  StockTransferLines: [
    {
      ItemCode: "55QUHW01",
      BaseType: "InventoryTransferRequest",
      BaseEntry: 368865,
      BaseLine: 0,
      SerialNumbers: [{ InternalSerialNumber: "55QUHW01L082500150", Quantity: 1 }],
    },
  ],
};

const ITR_ORDER = { sapDocType: "ITR" as const, sapDocEntry: 368865 };

function parsed(raw: Record<string, unknown> = COPIED_IT, kind: "IT" | "DR" = "IT"): FollowedDocument {
  const doc = parseFollowedDocument(kind, raw);
  if ("error" in doc) throw new Error(doc.error);
  return doc;
}

function placement(over: Partial<CurrentPlacement>): CurrentPlacement {
  return {
    table: "branch",
    id: "row",
    serialNumberId: "s1",
    serialNo: "SN1",
    tenantId: "t1",
    place: "branch X",
    branchId: "b1",
    warehouseId: null,
    warehouseLocationId: null,
    serviceCenterId: null,
    serviceCenterLocationId: null,
    statusCode: "STK",
    ...over,
  };
}

describe("parseFollowedDocument", () => {
  it("reads the order number, base link and serials from a copied IT", () => {
    expect(parsed()).toEqual({
      kind: "IT",
      docEntry: 491349,
      docNum: 494398,
      docDate: "2026-10-27",
      displayNo: "494398",
      ismsRef: "ITR#2026-10-89938",
      cancelled: false,
      toWarehouse: "ABL003",
      lines: [
        {
          itemCode: "55QUHW01",
          basedOnOrderDoc: true,
          baseEntry: 368865,
          serialNos: ["55QUHW01L082500150"],
        },
      ],
    });
  });

  it("shows a DR by its DR number and reads SAP's cancel flags", () => {
    const doc = parsed(
      {
        DocEntry: 1,
        DocNum: 176454,
        U_DR_NUMBER: "DR-0091",
        U_ISMS_PO_No: "SO#2026-10-00034",
        Cancelled: "tYES",
        DocumentLines: [{ ItemCode: "A", BaseType: 17, BaseEntry: 94014, SerialNumbers: [] }],
      },
      "DR",
    );
    expect(doc.displayNo).toBe("DR-0091");
    expect(doc.cancelled).toBe(true);
    expect(doc.lines[0]?.basedOnOrderDoc).toBe(true);
  });

  it("refuses a row with no DocEntry", () => {
    expect(parseFollowedDocument("IT", { DocNum: 5 })).toEqual({
      error: "SAP document has no DocEntry/DocNum",
    });
  });
});

describe("checkFollowedDocument", () => {
  it("accepts an IT copied from the order's own ITR and returns its serials", () => {
    expect(checkFollowedDocument(parsed(), ITR_ORDER)).toEqual({
      ok: true,
      serialNos: ["55QUHW01L082500150"],
    });
  });

  it("flags a line copied from another ITR", () => {
    const check = checkFollowedDocument(parsed(), { sapDocType: "ITR", sapDocEntry: 1 });
    expect(check).toMatchObject({ ok: false, status: "FLAGGED" });
  });

  it("flags the wrong document kind for the order", () => {
    const check = checkFollowedDocument(parsed(), { sapDocType: "SO", sapDocEntry: 368865 });
    expect(check).toMatchObject({ ok: false, status: "FLAGGED" });
  });

  it("flags a document without serials rather than dispatching nothing", () => {
    const raw = {
      ...COPIED_IT,
      StockTransferLines: [{ ...COPIED_IT.StockTransferLines[0], SerialNumbers: [] }],
    };
    expect(checkFollowedDocument(parsed(raw), ITR_ORDER)).toMatchObject({
      ok: false,
      reason: "IT 494398 lists no serial numbers",
    });
  });
});

describe("deliveryStatusAfterFollow", () => {
  it.each([
    ["approved", "pending"],
    ["pending", "pending"],
    ["partial", "partial"],
    ["accepted", "partial"],
    ["rejected", null],
  ])("%s becomes %s", (current, next) => {
    expect(deliveryStatusAfterFollow(current)).toBe(next);
  });
});

describe("placementsToReplace", () => {
  it("replaces warehouse rows and the serial sync's STK row, and blocks anything else", () => {
    const rows = [
      placement({ id: "wh", table: "warehouse", statusCode: null }),
      placement({ id: "stk", statusCode: "STK" }),
      placement({ id: "sold", statusCode: "SLD" }),
      placement({ id: "sc", table: "service_center", statusCode: "STK" }),
    ];
    const { replaceIds, blocked } = placementsToReplace(rows);
    expect(replaceIds).toEqual(["wh", "stk"]);
    expect(blocked.map((row) => row.id)).toEqual(["sold", "sc"]);
  });
});
