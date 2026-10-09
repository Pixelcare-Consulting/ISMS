import {
  shouldRefreshExpectedLines,
  toStockCountSessionDetailDto,
} from "@/features/stock-audit/services/stock-count-session-detail";

describe("shouldRefreshExpectedLines", () => {
  it("refreshes only in-progress sessions with no expected lines", () => {
    expect(
      shouldRefreshExpectedLines({
        status: "in_progress",
        lines: [{ expectedInCount: false }],
      }),
    ).toBe(true);
    expect(
      shouldRefreshExpectedLines({
        status: "in_progress",
        lines: [],
      }),
    ).toBe(true);
    expect(
      shouldRefreshExpectedLines({
        status: "in_progress",
        lines: [{ expectedInCount: true }],
      }),
    ).toBe(false);
    expect(
      shouldRefreshExpectedLines({
        status: "counting_complete",
        lines: [],
      }),
    ).toBe(false);
  });
});

describe("toStockCountSessionDetailDto", () => {
  it("maps a session to a plain detail DTO with a stable id", () => {
    const dto = toStockCountSessionDetailDto({
      id: "sess-1",
      sessionNo: "CNT-ABC",
      status: "in_progress",
      branch: { name: "Makati", sapCode: "ABM001" },
      lines: [
        {
          id: "line-1",
          status: "pending",
          expectedInCount: true,
          serialNumber: { serialNo: "SN-1" },
          model: {
            skuCode: "55QUHW01",
            name: "TV",
            brand: { name: "Devant" },
          },
          countedBy: null,
        },
      ],
      variances: [],
    });

    expect(dto.id).toBe("sess-1");
    expect(dto.sessionNo).toBe("CNT-ABC");
    expect(dto.lines).toHaveLength(1);
    expect(dto.lines[0]?.serialNumber.serialNo).toBe("SN-1");
    expect(dto.branch.sapCode).toBe("ABM001");
  });
});
