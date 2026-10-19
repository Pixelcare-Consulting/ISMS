jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, permission: string) => permissions?.includes(permission) ?? false,
}));
jest.mock("@/lib/aor/scope", () => ({ getUserBranchIds: jest.fn() }));
jest.mock("@/features/reports/services/sales-report.service", () => ({
  salesReportService: { listRows: jest.fn() },
}));
jest.mock("@/features/reports/services/transfer-report.service", () => ({
  transferReportService: { listRows: jest.fn() },
}));
jest.mock("@/features/reports/services/processed-orders-report.service", () => ({
  processedOrdersReportService: { listRows: jest.fn() },
}));
jest.mock("@/features/reports/services/daily-stock-report.service", () => ({
  dailyStockReportService: { listRows: jest.fn() },
}));
jest.mock("@/features/reports/services/inventory-report.service", () => ({ buildInventoryReportRows: jest.fn() }));
jest.mock("@/features/dashboard/services/dashboard-kpi.service", () => ({
  getDashboardKpis: jest.fn(),
  getDashboardAnalytics: jest.fn(),
}));
jest.mock("@/features/dashboard/services/dashboard-sales.service", () => ({ getDashboardSalesAnalytics: jest.fn() }));

import { buildInventoryReportRows } from "@/features/reports/services/inventory-report.service";
import { transferReportService } from "@/features/reports/services/transfer-report.service";
import {
  DatasetAccessError,
  MAX_DATASET_ROWS,
  canAccessDataset,
  listAccessibleDatasetKeys,
  loadDataset,
} from "@/features/reporting/services/dataset-registry";
import { getUserBranchIds } from "@/lib/aor/scope";

const branchIds = getUserBranchIds as jest.Mock;
const listTransfers = transferReportService.listRows as jest.Mock;
const inventoryRows = buildInventoryReportRows as jest.Mock;

const ctx = (permissions: string[]) => ({ tenantId: "t1", userId: "u1", permissions });

describe("dataset access", () => {
  it("follows the report export permissions", () => {
    expect(canAccessDataset("transfers", ["logistics.view"])).toBe(true);
    expect(canAccessDataset("transfers", ["sales.create"])).toBe(false);
    expect(canAccessDataset("sales_lines", ["sales.create"])).toBe(true);
    expect(canAccessDataset("inventory_detail", ["inventory.view"])).toBe(true);
    expect(canAccessDataset("inventory_detail", ["logistics.view"])).toBe(false);
  });

  it("lists nothing for a user without report or dashboard permissions", () => {
    expect(listAccessibleDatasetKeys(["policies.view"])).toEqual([]);
  });

  it("refuses to load a dataset the caller cannot open", async () => {
    await expect(loadDataset("transfers", ctx(["policies.view"]), {})).rejects.toBeInstanceOf(DatasetAccessError);
    expect(listTransfers).not.toHaveBeenCalled();
  });
});

describe("dataset branch scope", () => {
  it("passes the caller's AOR, with no AOR meaning an empty list like the exports", async () => {
    branchIds.mockResolvedValue(null);
    listTransfers.mockResolvedValue([]);
    await loadDataset("transfers", ctx(["reports.view"]), { from: "2026-10-01", to: "2026-10-19" });
    expect(listTransfers).toHaveBeenCalledWith("t1", {
      from: new Date("2026-10-01T00:00:00.000Z"),
      to: new Date("2026-10-19T23:59:59.999Z"),
      branchIds: [],
    });
  });

  it("lifts the branch limit for branch managers and approvers", async () => {
    branchIds.mockResolvedValue(["b1"]);
    listTransfers.mockResolvedValue([]);
    await loadDataset("transfers", ctx(["reports.view", "branches.manage"]), {});
    expect(listTransfers).toHaveBeenCalledWith("t1", expect.objectContaining({ branchIds: undefined }));
  });

  it("keeps the inventory report's all-branches fallback when there's no AOR", async () => {
    branchIds.mockResolvedValue(null);
    inventoryRows.mockResolvedValue({ summaryRows: [], detailRows: [] });
    await loadDataset("inventory_summary", ctx(["inventory.view"]), {});
    expect(inventoryRows).toHaveBeenCalledWith("t1", expect.objectContaining({ branchIds: undefined }));
  });

  it("rejects a branch outside the caller's AOR", async () => {
    branchIds.mockResolvedValue(["b1"]);
    await expect(loadDataset("transfers", ctx(["reports.view"]), { branchId: "b2" })).rejects.toThrow(
      "Branch is outside your assigned area",
    );
  });

  it("narrows to a branch inside the AOR", async () => {
    branchIds.mockResolvedValue(["b1", "b2"]);
    listTransfers.mockResolvedValue([]);
    await loadDataset("transfers", ctx(["reports.view"]), { branchId: "b2" });
    expect(listTransfers).toHaveBeenCalledWith("t1", expect.objectContaining({ branchIds: ["b2"] }));
  });
});

describe("dataset shaping", () => {
  it("caps rows and flags truncation", async () => {
    branchIds.mockResolvedValue(["b1"]);
    listTransfers.mockResolvedValue(
      Array.from({ length: MAX_DATASET_ROWS + 5 }, (_, i) => ({ transferNo: `T${i}`, date: "2026-10-01" })),
    );
    const result = await loadDataset("transfers", ctx(["reports.view"]), {});
    expect(result.rows).toHaveLength(MAX_DATASET_ROWS);
    expect(result.truncated).toBe(true);
  });

  it("maps positional inventory rows to named columns and blanks empty dates", async () => {
    branchIds.mockResolvedValue(["b1"]);
    inventoryRows.mockResolvedValue({
      summaryRows: [],
      detailRows: [["Dealer", "Branch", "", "", "", "", "", "SN1", "SKU1", "Model", "Stock", "", "", 4, ""]],
    });
    const { rows } = await loadDataset("inventory_detail", ctx(["inventory.view"]), {});
    expect(rows[0]).toMatchObject({ dealer: "Dealer", serialNo: "SN1", agingDays: 4, drDate: null });
    expect(inventoryRows).toHaveBeenCalledWith("t1", expect.objectContaining({ statusCodes: ["STK"] }));
  });
});
