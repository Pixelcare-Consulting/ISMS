jest.mock("@/features/sap/services/sap-service-layer-client", () => ({
  sapServiceLayerClient: { request: jest.fn() },
}));

import {
  buildDrBody,
  buildItBody,
  buildItrBody,
  fitSapText,
  buildReturnBody,
  postSapDocument,
} from "@/features/sap/services/sap-documents";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";

const request = sapServiceLayerClient.request as jest.Mock;
const creds = {} as SapServiceLayerCredentials;

// Loose view of a built body so assertions can index into the line arrays.
type Body = Record<string, Record<string, unknown>[]> & Record<string, unknown>;

const res = (statusCode: number, data: unknown = {}, rawBody = JSON.stringify(data)) => ({
  statusCode,
  data,
  rawBody,
  headers: {},
});

describe("SAP document builders", () => {
  it("buildItBody puts serials on lines with InternalSerialNumber and base ITR refs", () => {
    const body = buildItBody({
      ismsRef: "TR-1",
      fromWhs: "A",
      toWhs: "B",
      baseItrEntry: 77,
      lines: [{ itemCode: "X", serialNos: ["SN1"], baseEntry: 77, baseLine: 0 }],
    }) as Body;
    expect(body.U_ISMS_PO_No).toBe("TR-1");
    expect(body.Comments).toBe("ISMS TR-1");
    const line = body.StockTransferLines[0];
    expect(line.SerialNumbers).toEqual([{ InternalSerialNumber: "SN1", Quantity: 1 }]);
    expect(line.Quantity).toBe(1);
    expect(line.BaseEntry).toBe(77);
    expect(line.BaseType).toBe("InventoryTransferRequest");
  });

  it("buildDrBody uses BaseType 17", () => {
    const body = buildDrBody({
      ismsRef: "D-1",
      cardCode: "C1",
      whs: "W",
      baseSoEntry: 5,
      lines: [{ itemCode: "X", serialNos: ["S1", "S2"], baseEntry: 5, baseLine: 1 }],
    }) as Body;
    expect(body.DocumentLines[0].BaseType).toBe(17);
    expect(body.DocumentLines[0].Quantity).toBe(2);
  });

  it("buildReturnBody uses BaseType 15", () => {
    const body = buildReturnBody({
      ismsRef: "R-1",
      cardCode: "C1",
      whs: "W",
      baseDrEntry: 9,
      lines: [{ itemCode: "X", serialNos: ["S1"], baseEntry: 9, baseLine: 0 }],
    }) as Body;
    expect(body.DocumentLines[0].BaseType).toBe(15);
  });
});

describe("buildItrBody", () => {
  const base = {
    ismsRef: "ITR#2026-10-94860",
    fromWhs: "FWH14P1F",
    toWhs: "ABL003",
    branchName: "ABENSON LCC IRIGA",
    lines: [{ itemCode: "55QUHW01", quantity: 1 }],
  };

  it("puts the order notes in Remarks and a readable Journal Remarks on the header", () => {
    const body = buildItrBody({ ...base, notes: "Deliver before the weekend sale." }) as Body;
    expect(body.U_ISMS_PO_No).toBe("ITR#2026-10-94860");
    expect(body.Comments).toBe("Deliver before the weekend sale.");
    expect(body.JournalMemo).toBe("ISMS ITR#2026-10-94860 · ABENSON LCC IRIGA");
  });

  it("sends the order's delivery due date, and leaves Due Date to SAP when there is none", () => {
    expect((buildItrBody({ ...base, dueDate: "2026-11-03" }) as Body).DueDate).toBe("2026-11-03");
    expect(buildItrBody({ ...base, dueDate: null })).not.toHaveProperty("DueDate");
    expect(buildItrBody(base)).not.toHaveProperty("DueDate");
  });

  it("falls back to the ISMS reference in Remarks when the order has no notes", () => {
    const body = buildItrBody({ ...base, notes: "  " }) as Body;
    expect(body.Comments).toBe("ISMS ITR#2026-10-94860");
  });

  it("stamps the order number and branch name on every line, within SAP's column sizes", () => {
    const body = buildItrBody({ ...base, branchName: "ABENSON ABREEZA DAVAO" }) as Body;
    expect(body.StockTransferLines[0]).toMatchObject({
      ItemCode: "55QUHW01",
      U_ISMS_PONum: "ITR#2026-10-94860",
      U_Branch_Name: "ABENSON ABREEZA DAV…",
      U_Branch_Namelong: "ABENSON ABREEZA DAVAO",
    });
    expect(String(body.StockTransferLines[0].U_Branch_Name)).toHaveLength(20);
  });

  it("keeps long notes and journal remarks inside SAP's limits", () => {
    const body = buildItrBody({
      ...base,
      branchName: "A".repeat(60),
      notes: "x ".repeat(300),
    }) as Body;
    expect(String(body.Comments).length).toBeLessThanOrEqual(254);
    expect(String(body.JournalMemo).length).toBeLessThanOrEqual(50);
  });
});

describe("fitSapText", () => {
  it("collapses whitespace and only cuts when it must", () => {
    expect(fitSapText("  line one\n line   two ", 30)).toBe("line one line two");
    expect(fitSapText("abcdef", 4)).toBe("abc…");
  });
});

describe("postSapDocument", () => {
  beforeEach(() => request.mockReset());

  it("returns existing doc when U_ISMS_PO_No matches", async () => {
    request
      .mockResolvedValueOnce(res(200, { value: [{ DocEntry: 12 }] }))
      .mockResolvedValueOnce(
        res(200, {
          DocEntry: 12,
          DocNum: 100,
          DocDate: "2026-10-21T00:00:00Z",
          U_DR_NUMBER: null,
          DocumentLines: [{ LineNum: 0 }, { LineNum: 1 }],
        }),
      );
    const ref = await postSapDocument(creds, "SO", "O'1", {});
    expect(request.mock.calls.every(([c]) => c.method === "GET")).toBe(true);
    expect(request.mock.calls[0][0].path).toContain("O''1");
    expect(ref).toEqual({
      docEntry: 12,
      docNum: 100,
      docDate: "2026-10-21",
      displayNo: "100",
      lineNums: [0, 1],
    });
  });

  it("throws SAP's message on 400", async () => {
    request
      .mockResolvedValueOnce(res(200, { value: [] }))
      .mockResolvedValueOnce(res(400, {}, JSON.stringify({ error: { message: { value: "Item X not in stock" } } })));
    await expect(postSapDocument(creds, "IT", "T-1", {})).rejects.toThrow("Item X not in stock");
  });

  it("throws when the lookup fails instead of posting", async () => {
    request.mockResolvedValueOnce(res(500, {}, "boom"));
    await expect(postSapDocument(creds, "IT", "T-1", {})).rejects.toThrow("500");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("throws when POST returns no DocEntry", async () => {
    request.mockResolvedValueOnce(res(200, { value: [] })).mockResolvedValueOnce(res(201, {}));
    await expect(postSapDocument(creds, "DR", "D-1", {})).rejects.toThrow(
      "succeeded but returned no document reference",
    );
  });

  it("displayNo prefers U_DR_NUMBER over DocNum", async () => {
    request
      .mockResolvedValueOnce(res(200, { value: [] }))
      .mockResolvedValueOnce(res(201, { DocEntry: 3 }))
      .mockResolvedValueOnce(
        res(200, {
          DocEntry: 3,
          DocNum: 44,
          DocDate: "2026-10-20",
          U_DR_NUMBER: " DR-0003 ",
          StockTransferLines: [{ LineNum: 0 }],
        }),
      );
    const ref = await postSapDocument(creds, "IT", "T-2", { a: 1 });
    expect(request.mock.calls[1][0]).toMatchObject({ method: "POST", path: "/StockTransfers" });
    expect(request.mock.calls[2][0].path).toContain("StockTransferLines");
    expect(ref.displayNo).toBe("DR-0003");
    expect(ref.docNum).toBe(44);
  });
});
