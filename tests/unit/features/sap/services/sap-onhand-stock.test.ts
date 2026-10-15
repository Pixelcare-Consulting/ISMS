jest.mock("@/features/sap/services/sap-service-layer-client", () => ({
  sapServiceLayerClient: { request: jest.fn() },
}));

import {
  ensureSapOnHandQuery,
  fetchSapSerialLocations,
} from "@/features/sap/services/sap-onhand-stock";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";

const request = sapServiceLayerClient.request as jest.Mock;
const creds = { id: "c1", companyDb: "DB" } as unknown as SapServiceLayerCredentials;

function ok(data: unknown) {
  return { statusCode: 200, data, rawBody: JSON.stringify(data), headers: {} };
}

function sapError(statusCode: number, code: number, message: string) {
  const body = { error: { code, message: { lang: "en-us", value: message } } };
  return { statusCode, data: body, rawBody: JSON.stringify(body), headers: {} };
}

beforeEach(() => request.mockReset());

describe("fetchSapSerialLocations", () => {
  it("reads the page's serial range and follows nextLink", async () => {
    request
      .mockResolvedValueOnce(
        ok({
          value: [{ AbsEntry: 11, DistNumber: "SN1", ItemCode: "32STV105", WhsCode: "ABB001" }],
          "odata.nextLink": "SQLQueries('ISMS_SN_LOC_RANGE')/List?lo=10&hi=20&$skip=1",
        }),
      )
      .mockResolvedValueOnce(
        ok({ value: [{ AbsEntry: 12, DistNumber: " SN2 ", ItemCode: "32STV105", WhsCode: "FWH14P1F" }] }),
      );

    const rows = await fetchSapSerialLocations(creds, 10, 20);

    expect(request.mock.calls[0][0].path).toBe("/SQLQueries('ISMS_SN_LOC_RANGE')/List?lo=10&hi=20");
    expect(request.mock.calls[1][0].path).toBe(
      "/SQLQueries('ISMS_SN_LOC_RANGE')/List?lo=10&hi=20&$skip=1",
    );
    expect(rows).toEqual([
      { serialNo: "SN1", itemCode: "32STV105", warehouseCode: "ABB001" },
      { serialNo: "SN2", itemCode: "32STV105", warehouseCode: "FWH14P1F" },
    ]);
  });

  it("reads SAP's 'no matching records' 404 as nothing on hand", async () => {
    request.mockResolvedValueOnce(sapError(404, -2028, "No matching records found (ODBC -2028)"));
    await expect(fetchSapSerialLocations(creds, 0, 5)).resolves.toEqual([]);
  });

  it("throws on any other SAP error", async () => {
    request.mockResolvedValueOnce(sapError(400, 701, "Invalid SQL syntax"));
    await expect(fetchSapSerialLocations(creds, 0, 5)).rejects.toThrow("Invalid SQL syntax");
  });
});

describe("ensureSapOnHandQuery", () => {
  // The module caches confirmed queries per connection, so each case uses its own.
  const fresh = (id: string) => ({ id, companyDb: "DB" }) as unknown as SapServiceLayerCredentials;
  const missing = () => sapError(404, -2028, "No matching records found");

  it("does nothing more when the query already exists", async () => {
    request.mockResolvedValueOnce(ok({ SqlCode: "ISMS_SN_LOC_RANGE" }));
    await ensureSapOnHandQuery(fresh("exists"));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("creates a missing query with its SQL", async () => {
    request.mockResolvedValueOnce(missing()).mockResolvedValueOnce(ok({}));

    await ensureSapOnHandQuery(fresh("create"));

    expect(request.mock.calls[1][0]).toMatchObject({
      method: "POST",
      path: "/SQLQueries",
      body: {
        SqlCode: "ISMS_SN_LOC_RANGE",
        SqlText: expect.stringContaining("WHERE T1.AbsEntry > :lo AND T1.AbsEntry <= :hi"),
      },
    });
  });

  it("checks SAP once per connection, then trusts the cache", async () => {
    const cached = fresh("cached");
    request.mockResolvedValueOnce(ok({ SqlCode: "ISMS_SN_LOC_RANGE" }));
    await ensureSapOnHandQuery(cached);
    await ensureSapOnHandQuery(cached);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("accepts a create that lost a race to another run", async () => {
    request
      .mockResolvedValueOnce(missing())
      .mockResolvedValueOnce(sapError(400, -2035, "This entry already exists"))
      .mockResolvedValueOnce(ok({ SqlCode: "ISMS_SN_LOC_RANGE" }));
    await expect(ensureSapOnHandQuery(fresh("race"))).resolves.toBeUndefined();
  });

  it("names the setup script when SAP refuses to create it", async () => {
    request
      .mockResolvedValueOnce(missing())
      .mockResolvedValueOnce(sapError(403, -1, "No permission"))
      .mockResolvedValueOnce(missing());
    await expect(ensureSapOnHandQuery(fresh("refused"))).rejects.toThrow(
      /could not create the SAP saved query ISMS_SN_LOC_RANGE.*No permission.*setup-sap-serial-onhand-query\.mjs/,
    );
  });
});
