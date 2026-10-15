import {
  isPcountUploadStatus,
  PCOUNT_VARIANCE_REMARK,
  pcountRemarkForUploadedRow,
} from "@/features/monthly-sir/constants/pcount-upload";

describe("P-Count upload statuses and variance remarks", () => {
  it("accepts only DEF, STK, and DU", () => {
    expect(isPcountUploadStatus("DEF")).toBe(true);
    expect(isPcountUploadStatus("stk")).toBe(true);
    expect(isPcountUploadStatus("DU")).toBe(true);
    expect(isPcountUploadStatus("SLD")).toBe(false);
    expect(isPcountUploadStatus("VAR")).toBe(false);
  });

  it("marks surplus and status mismatches the way Generate Variance does", () => {
    expect(
      pcountRemarkForUploadedRow({
        pcount: "STK",
        expectedInCount: true,
        systemStatus: "STK",
      }),
    ).toBe("P-COUNT: STK");

    expect(
      pcountRemarkForUploadedRow({
        pcount: "DEF",
        expectedInCount: true,
        systemStatus: "DEF",
      }),
    ).toBe("P-COUNT: DEF");

    expect(
      pcountRemarkForUploadedRow({
        pcount: "DU",
        expectedInCount: true,
        systemStatus: "DU",
      }),
    ).toBe("P-COUNT: DU");

    expect(
      pcountRemarkForUploadedRow({
        pcount: "DEF",
        expectedInCount: true,
        systemStatus: "STK",
      }),
    ).toBe(PCOUNT_VARIANCE_REMARK);

    expect(
      pcountRemarkForUploadedRow({
        pcount: "STK",
        expectedInCount: false,
        systemStatus: null,
      }),
    ).toBe(PCOUNT_VARIANCE_REMARK);
  });
});
