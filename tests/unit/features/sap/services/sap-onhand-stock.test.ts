jest.mock("@/features/sap/services/sap-service-layer-client", () => ({
  sapServiceLayerClient: { request: jest.fn() },
}));

import {
  ensureSapOnHandQuery,
  fetchSapItemOnHand,
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

describe("fetchSapItemOnHand", () => {
  it("reads SAP's In Stock per item from the OITW query, rounding decimals", async () => {
    request.mockResolvedValueOnce(
      ok({
        value: [
          { ItemCode: "32STV105", OnHand: 15 },
          { ItemCode: "43STW102", OnHand: 9.999999 },
          { ItemCode: "ZERO", OnHand: 0 },
        ],
      }),
    );

    const onHand = await fetchSapItemOnHand(creds, "ABB001");

    expect(request.mock.calls[0][0].path).toBe("/SQLQueries('ISMS_ITEM_ONHAND')/List?whs='ABB001'");
    expect(onHand).toEqual(new Map([["32STV105", 15], ["43STW102", 10]]));
  });
});

describe("ensureSapOnHandQuery", () => {
  // The module caches confirmed queries per connection, so each case uses its own.
  const fresh = (id: string) => ({ id, companyDb: "DB" }) as unknown as SapServiceLayerCredentials;
  const missing = () => sapError(404, -2028, "No matching records found");

  it("does nothing more when the query already exists", async () => {
    request.mockResolvedValueOnce(ok({ SqlCode: "ISMS_SN_ONHAND" }));
    await ensureSapOnHandQuery(fresh("exists"), "ISMS_SN_ONHAND");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("creates a missing query with its SQL", async () => {
    request.mockResolvedValueOnce(missing()).mockResolvedValueOnce(ok({}));

    await ensureSapOnHandQuery(fresh("create"), "ISMS_ITEM_ONHAND");

    expect(request.mock.calls[1][0]).toMatchObject({
      method: "POST",
      path: "/SQLQueries",
      body: {
        SqlCode: "ISMS_ITEM_ONHAND",
        SqlText: expect.stringContaining("FROM OITW T0 WHERE T0.WhsCode = :whs"),
      },
    });
  });

  it("checks SAP once per connection, then trusts the cache", async () => {
    const creds = fresh("cached");
    request.mockResolvedValueOnce(ok({ SqlCode: "ISMS_SN_ONHAND" }));
    await ensureSapOnHandQuery(creds, "ISMS_SN_ONHAND");
    await ensureSapOnHandQuery(creds, "ISMS_SN_ONHAND");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("accepts a create that lost a race to another run", async () => {
    request
      .mockResolvedValueOnce(missing())
      .mockResolvedValueOnce(sapError(400, -2035, "This entry already exists"))
      .mockResolvedValueOnce(ok({ SqlCode: "ISMS_SN_ONHAND" }));
    await expect(ensureSapOnHandQuery(fresh("race"), "ISMS_SN_ONHAND")).resolves.toBeUndefined();
  });

  it("names the setup script when SAP refuses to create it", async () => {
    request
      .mockResolvedValueOnce(missing())
      .mockResolvedValueOnce(sapError(403, -1, "No permission"))
      .mockResolvedValueOnce(missing());
    await expect(ensureSapOnHandQuery(fresh("refused"), "ISMS_SN_ONHAND")).rejects.toThrow(
      /could not create the SAP saved query ISMS_SN_ONHAND.*No permission.*setup-sap-serial-onhand-query\.mjs/,
    );
  });
});
