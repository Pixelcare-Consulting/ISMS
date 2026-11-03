jest.mock("@/lib/database/client", () => ({ prisma: { branchOrder: { findMany: jest.fn() } } }));

import { orderSummaryReportService } from "@/features/reports/services/order-summary-report.service";
import { prisma } from "@/lib/database/client";

const findMany = prisma.branchOrder.findMany as jest.Mock;

function order(over: Record<string, unknown>) {
  return {
    orderNumber: "SO#1",
    source: "ISMS",
    orderType: "manual",
    status: "pending_sp",
    createdAt: new Date("2026-11-02T16:30:00.000Z"),
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
  createdFrom: new Date("2026-11-02T16:00:00.000Z"),
  createdTo: new Date("2026-11-03T15:59:59.999Z"),
  statuses: ["pending_sp" as const, "approved" as const],
};

describe("orderSummaryReportService.listRows", () => {
  it("counts requested figures before approval, and approved ones (with their CBM) after", async () => {
    findMany.mockResolvedValue([
      order({}),
      order({ orderNumber: "SAP-SO-9", source: "SAP", status: "approved", sapDocType: "SO", sapDocNum: 97580 }),
    ]);

    const [pending, approved] = await orderSummaryReportService.listRows("t1", filters);

    expect(pending).toMatchObject({
      date: "2026-11-03",
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

  it("skips the query when no status or no branch is in scope", async () => {
    await expect(orderSummaryReportService.listRows("t1", { ...filters, statuses: [] })).resolves.toEqual([]);
    await expect(orderSummaryReportService.listRows("t1", { ...filters, branchIds: [] })).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
