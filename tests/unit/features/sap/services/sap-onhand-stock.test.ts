jest.mock("@/features/sap/services/sap-service-layer-client", () => ({
  sapServiceLayerClient: { request: jest.fn() },
}));

import {
  assertSapOnHandQueryInstalled,
  countByItem,
  fetchSapOnHandPage,
  fetchSapOnHandSerials,
} from "@/features/sap/services/sap-onhand-stock";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";

const request = sapServiceLayerClient.request as jest.Mock;
const creds = { id: "c1" } as unknown as SapServiceLayerCredentials;

function ok(data: unknown) {
  return { statusCode: 200, data, rawBody: JSON.stringify(data), headers: {} };
}

function sapError(statusCode: number, code: number, message: string) {
  const body = { error: { code, message: { lang: "en-us", value: message } } };
  return { statusCode, data: body, rawBody: JSON.stringify(body), headers: {} };
}

beforeEach(() => request.mockReset());

describe("fetchSapOnHandSerials", () => {
  it("follows nextLink to the end and maps rows", async () => {
    request
      .mockResolvedValueOnce(
        ok({
          value: [{ ItemCode: "32STV105", DistNumber: "SN1", WhsCode: "ABB001" }],
          "odata.nextLink": "SQLQueries('ISMS_SN_ONHAND')/List?whs='ABB001'&$skip=1",
        }),
      )
      .mockResolvedValueOnce(
        ok({ value: [{ ItemCode: "32DL641", DistNumber: " SN2 ", WhsCode: "ABB001" }] }),
      );

    const serials = await fetchSapOnHandSerials(creds, "ABB001");

    expect(serials).toEqual([
      { itemCode: "32STV105", serialNo: "SN1" },
      { itemCode: "32DL641", serialNo: "SN2" },
    ]);
    expect(request.mock.calls[0][0].path).toBe("/SQLQueries('ISMS_SN_ONHAND')/List?whs='ABB001'");
    expect(request.mock.calls[1][0].path).toBe(
      "/SQLQueries('ISMS_SN_ONHAND')/List?whs='ABB001'&$skip=1",
    );
  });

  it("reads SAP's 'no matching records' 404 as an empty branch", async () => {
    request.mockResolvedValueOnce(sapError(404, -2028, "No matching records found (ODBC -2028)"));
    await expect(fetchSapOnHandSerials(creds, "ABB002")).resolves.toEqual([]);
  });

  it("throws on any other SAP error", async () => {
    request.mockResolvedValueOnce(sapError(400, 702, "Table 'OWHS' not accessible"));
    await expect(fetchSapOnHandSerials(creds, "ABB001")).rejects.toThrow(
      "Table 'OWHS' not accessible",
    );
  });
});

describe("fetchSapOnHandPage", () => {
  it("resumes at a saved $skip and returns the next one from nextLink", async () => {
    request.mockResolvedValueOnce(
      ok({
        value: [{ ItemCode: "32STV105", DistNumber: "SN3" }],
        "odata.nextLink": "SQLQueries('ISMS_SN_ONHAND')/List?whs='FWH14P1F'&$skip=6000",
      }),
    );

    const page = await fetchSapOnHandPage(creds, "FWH14P1F", 4000);

    expect(request.mock.calls[0][0].path).toBe(
      "/SQLQueries('ISMS_SN_ONHAND')/List?whs='FWH14P1F'&$skip=4000",
    );
    expect(page).toEqual({ serials: [{ itemCode: "32STV105", serialNo: "SN3" }], nextSkip: 6000 });
  });

  it("reports the last page with a null nextSkip", async () => {
    request.mockResolvedValueOnce(ok({ value: [] }));
    await expect(fetchSapOnHandPage(creds, "FWH01SKD")).resolves.toEqual({
      serials: [],
      nextSkip: null,
    });
  });
});

describe("countByItem", () => {
  it("counts units per item code", () => {
    expect(
      countByItem([
        { itemCode: "A", serialNo: "1" },
        { itemCode: "A", serialNo: "2" },
        { itemCode: "B", serialNo: "3" },
      ]),
    ).toEqual(new Map([["A", 2], ["B", 1]]));
  });
});

describe("assertSapOnHandQueryInstalled", () => {
  it("passes when the saved query exists", async () => {
    request.mockResolvedValueOnce(ok({ SqlCode: "ISMS_SN_ONHAND" }));
    await expect(assertSapOnHandQueryInstalled(creds)).resolves.toBeUndefined();
  });

  it("names the setup script when the query is missing", async () => {
    request.mockResolvedValueOnce(sapError(404, -2028, "No matching records found"));
    await expect(assertSapOnHandQueryInstalled(creds)).rejects.toThrow(
      "setup-sap-serial-onhand-query.mjs",
    );
  });
});
