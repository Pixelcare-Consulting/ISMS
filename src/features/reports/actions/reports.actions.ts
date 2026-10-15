"use server";

import { branchService } from "@/features/branches/services/branch.service";
import { ORDER_VIEW_REPORT_PERMISSIONS } from "@/features/orders/constants/order-permissions";
import { exportInventoryReportSchema } from "@/features/reports/schemas/inventory-report.schema";
import { reportsService } from "@/features/reports/services/reports.service";
import { requirePermission } from "@/lib/auth/permissions";
import { dailyStockReportService } from "@/features/reports/services/daily-stock-report.service";
import { inventoryReportService } from "@/features/reports/services/inventory-report.service";
import { processedOrdersReportService } from "@/features/reports/services/processed-orders-report.service";
import { transferReportService } from "@/features/reports/services/transfer-report.service";
import { salesReportService } from "@/features/reports/services/sales-report.service";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { getUserBranchIds } from "@/lib/aor/scope";

const REPORT_ACCESS = ["reports.view", ...ORDER_VIEW_REPORT_PERMISSIONS] as const;
const INVENTORY_REPORT_ACCESS = ["reports.view", "inventory.view"] as const;

async function resolveReportBranchIds(tenantId: string, userId: string): Promise<string[]> {
  return (await getUserBranchIds(tenantId, userId)) ?? [];
}

export async function listProcessedOrdersReportAction(input?: {
  from?: string;
  to?: string;
  q?: string;
}) {
  const session = await requirePermission("reports.view");
  const branchIds = await resolveReportBranchIds(session.user.tenantId, session.user.id);
  return reportsService.listProcessedOrders(session.user.tenantId, {
    branchIds,
    from: input?.from ? new Date(input.from) : undefined,
    to: input?.to ? new Date(input.to) : undefined,
    q: input?.q?.trim() || undefined,
  });
}

export async function listDailyStockReportAction(input: { date: string }) {
  const session = await requirePermission("reports.view");
  const branchIds = await resolveReportBranchIds(session.user.tenantId, session.user.id);
  return reportsService.listDailyStock(session.user.tenantId, {
    date: new Date(input.date),
    branchIds,
  });
}

export async function listTransfersReportAction(input?: { from?: string; to?: string }) {
  const session = await requirePermission("reports.view");
  const branchIds = await resolveReportBranchIds(session.user.tenantId, session.user.id);
  return reportsService.listTransfers(session.user.tenantId, {
    branchIds,
    from: input?.from ? new Date(input.from) : undefined,
    to: input?.to ? new Date(input.to) : undefined,
  });
}

export async function exportProcessedOrdersCsvAction(input: {
  processedFrom?: string;
  processedTo?: string;
}) {
  const session = await requireAnyPermission([...REPORT_ACCESS]);
  const branchIds = await resolveReportBranchIds(session.user.tenantId, session.user.id);

  const csv = await processedOrdersReportService.generateCsv(session.user.tenantId, {
    processedFrom: input.processedFrom ? new Date(input.processedFrom) : undefined,
    processedTo: input.processedTo
      ? new Date(`${input.processedTo}T23:59:59.999Z`)
      : undefined,
    branchIds,
  });

  return {
    success: true as const,
    csv,
    filename: `processed-orders-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}

export async function exportDailyStockCsvAction(input: { date: string }) {
  const session = await requireAnyPermission([...REPORT_ACCESS]);
  if (!input.date) return { error: "Date is required" as const };
  const branchIds = await resolveReportBranchIds(session.user.tenantId, session.user.id);

  const csv = await dailyStockReportService.generateCsv(session.user.tenantId, {
    date: new Date(input.date),
    branchIds,
  });

  return {
    success: true as const,
    csv,
    filename: `daily-stock-${input.date}.csv`,
  };
}

export async function exportTransferReportCsvAction(input?: {
  from?: string;
  to?: string;
}) {
  const session = await requireAnyPermission([
    ...REPORT_ACCESS,
    "logistics.view",
    "logistics.create",
    "logistics.manage",
  ]);
  const branchIds = await resolveReportBranchIds(session.user.tenantId, session.user.id);

  const csv = await transferReportService.generateCsv(session.user.tenantId, {
    from: input?.from ? new Date(input.from) : undefined,
    to: input?.to ? new Date(`${input.to}T23:59:59.999Z`) : undefined,
    branchIds,
  });

  return {
    success: true as const,
    csv,
    filename: `transfer-report-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}

export async function exportSalesReportCsvAction(input?: { from?: string; to?: string }) {
  const session = await requireAnyPermission([...REPORT_ACCESS, "sales.create"]);
  const branchIds = await resolveReportBranchIds(session.user.tenantId, session.user.id);

  const csv = await salesReportService.generateCsv(session.user.tenantId, {
    from: input?.from ? new Date(input.from) : undefined,
    to: input?.to ? new Date(`${input.to}T23:59:59.999Z`) : undefined,
    branchIds,
  });

  return {
    success: true as const,
    csv,
    filename: `sales-report-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}

export async function listInventoryReportBranchesAction() {
  const session = await requireAnyPermission([...INVENTORY_REPORT_ACCESS]);
  const aorIds = await resolveReportBranchIds(
    session.user.tenantId,
    session.user.id,
  );
  const all = await branchService.listBranches(session.user.tenantId);
  const branches =
    aorIds.length > 0 ? all.filter((b) => aorIds.includes(b.id)) : all;
  return branches.map((b) => ({ id: b.id, name: b.name }));
}

export async function listInventoryReportStatusOptionsAction() {
  const session = await requireAnyPermission([...INVENTORY_REPORT_ACCESS]);
  const codes = await reasonStatusService.listActiveCodes(
    session.user.tenantId,
    "inventory_system",
  );
  return codes.map((c) => ({
    id: c.code,
    code: c.code,
    name: c.name,
  }));
}

export async function exportInventoryReportXlsxAction(input?: unknown) {
  const session = await requireAnyPermission([...INVENTORY_REPORT_ACCESS]);
  const parsed = exportInventoryReportSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { error: "Invalid export filters" as const };
  }

  const aorIds = await resolveReportBranchIds(
    session.user.tenantId,
    session.user.id,
  );
  const selectedBranchId = parsed.data.branchId?.trim();
  if (selectedBranchId && aorIds.length > 0 && !aorIds.includes(selectedBranchId)) {
    return { error: "Branch is outside your assigned area" as const };
  }

  const branchIds = selectedBranchId
    ? [selectedBranchId]
    : aorIds;

  // Omitted → STK only; empty array → all statuses.
  const statusCodes =
    parsed.data.statusCodes === undefined ? ["STK"] : parsed.data.statusCodes;

  const buffer = await inventoryReportService.generateWorkbook(
    session.user.tenantId,
    {
      from: parsed.data.from ? new Date(parsed.data.from) : undefined,
      to: parsed.data.to
        ? new Date(`${parsed.data.to}T23:59:59.999Z`)
        : undefined,
      branchIds,
      sku: parsed.data.sku?.trim() || undefined,
      statusCodes,
    },
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    success: true as const,
    base64: buffer.toString("base64"),
    filename: `inventory-report-${stamp}.xlsx`,
  };
}
