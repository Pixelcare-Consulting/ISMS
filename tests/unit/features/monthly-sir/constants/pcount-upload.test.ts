import { MONTHLY_SIR_VARIANCE_LABELS } from "@/features/monthly-sir/constants/monthly-sir";
import {
  isPcountUploadStatus,
  pcountDisplayRemark,
  pcountRemarkForUploadedRow,
  serialFromUncataloguedVariance,
  uncataloguedSerialVarianceDescription,
} from "@/features/monthly-sir/constants/pcount-upload";

describe("P-Count upload statuses and variance remarks", () => {
  it("accepts only DEF, STK, and DU", () => {
    expect(isPcountUploadStatus("DEF")).toBe(true);
    expect(isPcountUploadStatus("stk")).toBe(true);
    expect(isPcountUploadStatus("DU")).toBe(true);
    expect(isPcountUploadStatus("SLD")).toBe(false);
    expect(isPcountUploadStatus("VAR")).toBe(false);
  });

  it("writes the same labels Generate Variance uses", () => {
    expect(
      pcountRemarkForUploadedRow({
        pcount: "STK",
        expectedInCount: true,
        systemStatus: "STK",
      }),
    ).toBe(MONTHLY_SIR_VARIANCE_LABELS.matched);

    expect(
      pcountRemarkForUploadedRow({
        pcount: "DEF",
        expectedInCount: true,
        systemStatus: "DEF",
      }),
    ).toBe("IN FILE AND IN STK");

    expect(
      pcountRemarkForUploadedRow({
        pcount: "DU",
        expectedInCount: true,
        systemStatus: "DU",
      }),
    ).toBe("IN FILE AND IN STK");

    expect(
      pcountRemarkForUploadedRow({
        pcount: "DEF",
        expectedInCount: true,
        systemStatus: "STK",
      }),
    ).toBe("IN FILE NOT IN STK");

    expect(
      pcountRemarkForUploadedRow({
        pcount: "STK",
        expectedInCount: false,
        systemStatus: null,
      }),
    ).toBe("IN FILE NOT IN STK");
  });

  it("derives labels from the line and variance, including older P-COUNT notes", () => {
    expect(
      pcountDisplayRemark({
        expectedInCount: true,
        lineStatus: "counted",
        notes: "P-COUNT: STK",
      }),
    ).toBe("IN FILE AND IN STK");

    expect(
      pcountDisplayRemark({
        expectedInCount: true,
        lineStatus: "counted",
        notes: "P-COUNT: DEF",
      }),
    ).toBe("IN FILE AND IN STK");

    expect(
      pcountDisplayRemark({
        expectedInCount: true,
        lineStatus: "variance",
        varianceType: "status_mismatch",
        notes: "P-COUNT: VAR",
      }),
    ).toBe("IN FILE NOT IN STK");

    expect(
      pcountDisplayRemark({
        expectedInCount: false,
        lineStatus: "variance",
        varianceType: "surplus",
        notes: "P-COUNT: VAR",
      }),
    ).toBe("IN FILE NOT IN STK");

    expect(
      pcountDisplayRemark({
        expectedInCount: true,
        lineStatus: "variance",
        varianceType: "missing",
        notes: "P-COUNT: VAR",
      }),
    ).toBe("STK NOT IN FILE");

    expect(
      pcountDisplayRemark({
        expectedInCount: true,
        lineStatus: "pending",
        notes: null,
      }),
    ).toBe("");
  });

  it("reads the serial from a catalog-unknown surplus variance", () => {
    const description = uncataloguedSerialVarianceDescription("sn-new");
    expect(serialFromUncataloguedVariance(description)).toBe("sn-new");
    expect(serialFromUncataloguedVariance("Expected unit not scanned")).toBeNull();
  });
});
