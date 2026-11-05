jest.mock("@/lib/database/client", () => ({ prisma: { branchOrder: { findMany: jest.fn() } } }));

import {
  orderStatusDate,
  orderSummaryReportService,
} from "@/features/reports/services/order-summary-report.service";
import { prisma } from "@/lib/database/client";

const findMany = prisma.branchOrder.findMany as jest.Mock;

function order(over: Record<string, unknown>) {
  return {
    orderNumber: "SO#1",
    source: "ISMS",
    orderType: "manual",
    status: "pending_sp",
    createdAt: new Date("2026-11-02T16:30:00.000Z"),
    updatedAt: new Date("2026-11-02T16:30:00.000Z"),
    processedAt: null,
    approvalLevels: [],
    sapDocType: null,
    sapDocNum: null,
    branch: { name: "Branch A" },
    brand: null,
    createdBy: { name: " ", email: "tl@x.ph" },
    details: [
      { quantity: 3, approvedQty: null, model: { srp: 100, cbm: 2, brand: { name: "Devant" } } },
      { quantity: 0, approvedQty: 2, model: { srp: 50, cbm: 1, brand: { name: "Sonique" } } },
    ],
    ...over,
  };
}

const filters = {
  from: new Date("2026-11-02T16:00:00.000Z"),
  to: new Date("2026-11-03T15:59:59.999Z"),
  statuses: ["pending_sp" as const, "approved" as const],
};

describe("orderSummaryReportService.listRows", () => {
  it("counts requested figures before approval, and approved ones (with their CBM) after", async () => {
    findMany.mockResolvedValue([
      order({}),
      order({
        orderNumber: "SAP-SO-9",
        source: "SAP",
        status: "approved",
        processedAt: new Date("2026-11-03T02:00:00.000Z"),
        sapDocType: "SO",
        sapDocNum: 97580,
      }),
    ]);

    const [pending, approved] = await orderSummaryReportService.listRows("t1", filters);

    expect(pending).toMatchObject({
      date: "2026-11-03",
      statusDate: "2026-11-03 00:30",
      createdAt: "2026-11-03 00:30",
      status: "Pending SP",
      brand: "Devant, Sonique",
      lineCount: 2,
      requestedQty: 3,
      approvedQty: 0,
      requestedAmount: 300,
      approvedAmount: 0,
      totalCbm: 6,
      createdBy: "tl@x.ph",
      sapDocument: "",
    });
    expect(approved).toMatchObject({
      source: "SAP",
      status: "Approved",
      approvedQty: 5,
      approvedAmount: 400,
      totalCbm: 8,
      sapDocument: "SO 97580",
    });
  });

  it("lists rows by status date, oldest first, and keeps the created date beside it", async () => {
    findMany.mockResolvedValue([
      order({ orderNumber: "SO#1", status: "approved", processedAt: new Date("2026-11-03T04:00:00.000Z") }),
      order({
        orderNumber: "SO#2",
        status: "cancelled",
        approvalLevels: [{ rejectedAt: null }, { rejectedAt: new Date("2026-11-03T01:00:00.000Z") }],
      }),
    ]);

    const rows = await orderSummaryReportService.listRows("t1", filters);

    expect(rows.map((row) => [row.orderNumber, row.statusDate, row.createdAt])).toEqual([
      ["SO#2", "2026-11-03 09:00", "2026-11-03 00:30"],
      ["SO#1", "2026-11-03 12:00", "2026-11-03 00:30"],
    ]);
  });

  it("matches each status on its own date", async () => {
    findMany.mockResolvedValue([]);
    await orderSummaryReportService.listRows("t1", {
      ...filters,
      statuses: ["pending_sp", "approved", "rejected", "cancelled"],
    });

    const window = { gte: filters.from, lte: filters.to };
    expect(findMany.mock.calls[0][0].where.OR).toEqual([
      { status: { in: ["pending_sp"] }, createdAt: window },
      { status: "approved", processedAt: window },
      { status: { in: ["rejected", "cancelled"] }, approvalLevels: { some: { rejectedAt: window } } },
      {
        status: { in: ["rejected", "cancelled"] },
        updatedAt: window,
        approvalLevels: { none: { rejectedAt: { not: null } } },
      },
    ]);
  });

  it("only searches the date a ticked status uses", async () => {
    findMany.mockResolvedValue([]);
    await orderSummaryReportService.listRows("t1", { ...filters, statuses: ["approved"] });
    expect(findMany.mock.calls[0][0].where.OR).toEqual([
      { status: "approved", processedAt: { gte: filters.from, lte: filters.to } },
    ]);
  });

  it("skips the query when no status or no branch is in scope", async () => {
    await expect(orderSummaryReportService.listRows("t1", { ...filters, statuses: [] })).resolves.toEqual([]);
    await expect(orderSummaryReportService.listRows("t1", { ...filters, branchIds: [] })).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("orderStatusDate", () => {
  const createdAt = new Date("2026-10-01T00:00:00.000Z");
  const updatedAt = new Date("2026-10-09T00:00:00.000Z");
  const dates = { createdAt, updatedAt, processedAt: null, approvalLevels: [] };

  it("uses the created date while pending, even if the order was updated since", () => {
    expect(orderStatusDate({ ...dates, status: "pending_tl" })).toBe(createdAt);
  });

  it("uses the approval date once approved", () => {
    const processedAt = new Date("2026-10-05T00:00:00.000Z");
    expect(orderStatusDate({ ...dates, status: "approved", processedAt })).toBe(processedAt);
  });

  it("uses the latest rejection on a rejected or cancelled order", () => {
    const approvalLevels = [
      { rejectedAt: null },
      { rejectedAt: new Date("2026-10-03T00:00:00.000Z") },
      { rejectedAt: new Date("2026-10-04T00:00:00.000Z") },
    ];
    const expected = new Date("2026-10-04T00:00:00.000Z");
    expect(orderStatusDate({ ...dates, status: "rejected", approvalLevels })).toEqual(expected);
    expect(orderStatusDate({ ...dates, status: "cancelled", approvalLevels })).toEqual(expected);
  });

  it("uses the last update for an order cancelled because its SO closed in SAP", () => {
    expect(orderStatusDate({ ...dates, status: "cancelled" })).toBe(updatedAt);
  });
});
