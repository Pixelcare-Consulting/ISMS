import { pulloutPrintDocument } from "@/app/(app)/logistics/_components/pullout-print";
import type { PulloutDetail } from "@/features/logistics/services/pullout-posting.service";

const line = (overrides: Partial<PulloutDetail["lines"][number]> = {}) =>
  ({
    serialNumberId: "s1",
    serialNo: "SN1",
    skuCode: "SKU1",
    modelName: "Model One",
    priorCode: "STK",
    rejectedAt: null,
    ...overrides,
  }) as PulloutDetail["lines"][number];

const detail = (overrides: Partial<PulloutDetail> = {}) =>
  ({
    pulloutNo: "PLT-1",
    waybillNo: "WB-1",
    courierName: "LBC",
    scheduledAt: "2026-11-05T02:00:00.000Z",
    scheduledByName: "Logistics",
    status: { code: "pending_logistics", name: "Pending logistics", color: null },
    branch: { id: "b1", name: "Branch A" },
    warehouse: { id: "w1", name: "Main", code: "W1" },
    lines: [line()],
    ...overrides,
  }) as PulloutDetail;

describe("pulloutPrintDocument", () => {
  it("builds the slip once the waybill, courier and schedule are saved", () => {
    expect(pulloutPrintDocument(detail())).toEqual({
      title: "Pull-out",
      documentNo: "PLT-1",
      waybillNo: "WB-1",
      courierName: "LBC",
      scheduleDate: "Nov 5, 2026",
      fields: [
        { label: "Branch", value: "Branch A" },
        { label: "Destination warehouse", value: "Main (W1)" },
      ],
      lines: [{ model: "SKU1 Model One", detail: "SN1 · STK" }],
      lineHeaders: { model: "Model", detail: "Serial number" },
    });
  });

  it.each([
    ["waybill", { waybillNo: null }],
    ["courier", { courierName: " " }],
    ["schedule", { scheduledAt: null }],
  ])("is not ready without the %s", (_field, missing) => {
    expect(pulloutPrintDocument(detail(missing))).toBeNull();
  });

  it("prints the Manila date for an early morning schedule", () => {
    // 1 AM on Nov 6 in Manila is still Nov 5 in UTC.
    const document = pulloutPrintDocument(detail({ scheduledAt: "2026-11-05T17:00:00.000Z" }));

    expect(document?.scheduleDate).toBe("Nov 6, 2026");
  });

  it("leaves rejected units off the slip", () => {
    const document = pulloutPrintDocument(
      detail({
        lines: [line(), line({ serialNo: "SN2", rejectedAt: "2026-11-05T02:00:00.000Z" })],
      }),
    );

    expect(document?.lines).toHaveLength(1);
  });

  it("has no slip for a cancelled pull-out", () => {
    const status = { code: "cancelled", name: "Cancelled", color: null };

    expect(pulloutPrintDocument(detail({ status }))).toBeNull();
  });
});
