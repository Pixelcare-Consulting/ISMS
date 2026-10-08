jest.mock("@/lib/database/client", () => ({ prisma: {} }));
jest.mock("@/features/serial-numbers/repositories/serial-number.repository", () => ({
  serialNumberRepository: { setSapOnHandFlags: jest.fn() },
}));
jest.mock("@/features/sap/services/sap-onhand-stock", () => ({
  ensureSapOnHandQuery: jest.fn(),
  fetchSapSerialLocations: jest.fn(),
}));
jest.mock("@/features/sap/services/sap-service-layer.service", () => ({
  sapServiceLayerService: { getCredentials: jest.fn() },
}));

import {
  onHandDocRanges,
  serialsOnHandFromLocations,
} from "@/features/serial-numbers/services/serial-onhand-stamp";

describe("onHandDocRanges", () => {
  it("keeps a tight page as one window", () => {
    expect(onHandDocRanges([12, 11, 11])).toEqual([{ lo: 10, hi: 12 }]);
  });

  it("splits ids that sit far apart so the gap is not queried", () => {
    expect(onHandDocRanges([50000, 11])).toEqual([
      { lo: 10, hi: 11 },
      { lo: 49999, hi: 50000 },
    ]);
  });

  it("ignores blanks and non-positive ids", () => {
    expect(onHandDocRanges([Number.NaN, 0, -3, Infinity])).toEqual([]);
  });
});

describe("serialsOnHandFromLocations", () => {
  const page = [
    { serialNo: "SN1", itemCode: "55QUHW01" },
    { serialNo: "SN2", itemCode: "55QUHW01" },
  ];

  it("keeps the warehouse of a serial that matches the page item", () => {
    expect(
      serialsOnHandFromLocations(page, [
        { serialNo: "SN1", itemCode: "55QUHW01", warehouseCode: "ABL001" },
        { serialNo: "SN2", itemCode: "OTHER", warehouseCode: "ABB001" },
      ]),
    ).toEqual({
      onHand: [{ serialNo: "SN1", warehouseCode: "ABL001" }],
      notOnHand: ["SN2"],
    });
  });

  it("counts a serial once and keeps the earlier warehouse code", () => {
    expect(
      serialsOnHandFromLocations(page, [
        { serialNo: "SN1", itemCode: "55QUHW01", warehouseCode: "ABO001" },
        { serialNo: "SN1", itemCode: "55QUHW01", warehouseCode: "ABL001" },
      ]),
    ).toEqual({
      onHand: [{ serialNo: "SN1", warehouseCode: "ABL001" }],
      notOnHand: ["SN2"],
    });
  });
});
