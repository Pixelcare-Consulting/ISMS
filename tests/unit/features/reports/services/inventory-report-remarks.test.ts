import { prisma } from "@/lib/database/client";
import { inventoryRepository } from "@/features/inventory/repositories/inventory.repository";
import { buildInventoryReportRows } from "@/features/reports/services/inventory-report.service";

jest.mock("@/lib/database/client", () => ({
  prisma: {
    branchInventory: { findMany: jest.fn() },
    stockCountLine: { findMany: jest.fn() },
  },
}));

jest.mock("@/features/inventory/repositories/inventory.repository", () => ({
  inventoryRepository: {
    findLatestDeliveryReceipts: jest.fn(async () => []),
  },
}));

function inventoryRow(serialNumberId: string, serialNo: string) {
  return {
    branchId: "branch-1",
    serialNumberId,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    statusCode: { code: "STK", name: "Stock" },
    serialNumber: {
      serialNo,
      model: { skuCode: "SKU-1", name: "Widget" },
    },
    branch: {
      name: "Branch A",
      area: null,
      branchArea: null,
      dealer: null,
    },
  };
}

describe("inventory report count remarks", () => {
  it("uses the latest completed count label and leaves a blank when there is no count", async () => {
    (prisma.branchInventory.findMany as jest.Mock).mockResolvedValue([
      inventoryRow("sn-1", "SN-1"),
      inventoryRow("sn-2", "SN-2"),
    ]);
    (inventoryRepository.findLatestDeliveryReceipts as jest.Mock).mockResolvedValue(
      [],
    );
    (prisma.stockCountLine.findMany as jest.Mock).mockResolvedValue([
      {
        serialNumberId: "sn-1",
        expectedInCount: true,
        status: "counted",
        notes: "P-COUNT: STK",
        session: {
          branchId: "branch-1",
          createdAt: new Date("2026-09-01T00:00:00.000Z"),
        },
        variance: null,
      },
      {
        serialNumberId: "sn-1",
        expectedInCount: true,
        status: "variance",
        notes: "P-COUNT: VAR",
        session: {
          branchId: "branch-1",
          createdAt: new Date("2026-10-01T00:00:00.000Z"),
        },
        variance: { varianceType: "missing" },
      },
      {
        serialNumberId: "sn-1",
        expectedInCount: true,
        status: "counted",
        notes: "P-COUNT: STK",
        session: {
          branchId: "other-branch",
          createdAt: new Date("2026-10-15T00:00:00.000Z"),
        },
        variance: null,
      },
    ]);

    const { detailRows, summaryRows } = await buildInventoryReportRows("tenant-1");

    expect(summaryRows[0]).toEqual(["Branch A", "SKU-1", "Stock", 2]);
    expect(detailRows.map((row) => [row[7], row[14]])).toEqual([
      ["SN-1", "STK NOT IN FILE"],
      ["SN-2", ""],
    ]);
  });
});