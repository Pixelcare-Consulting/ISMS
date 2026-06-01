"use server";

import { reportsService } from "@/features/reports/services/reports.service";
import { requirePermission } from "@/lib/auth/permissions";
import { branchService } from "@/features/branches/services/branch.service";
import { dailyStockReportService } from "@/features/reports/services/daily-stock-report.service";
import { processedOrdersReportService } from "@/features/reports/services/processed-orders-report.service";
import { transferReportService } from "@/features/reports/services/transfer-report.service";
import { requireAnyPermission } from "@/lib/auth/permissions";

const REPORT_ACCESS = ["reports.view", "orders.view"] as const;

export async function listProcessedOrdersReportAction(input?: {
  branchId?: string;
  from?: string;
  to?: string;
  q?: string;
}) {
  const session = await requirePermission("reports.view");
  return reportsService.listProcessedOrders(session.user.tenantId, {
    branchId: input?.branchId,
    from: input?.from ? new Date(input.from) : undefined,
    to: input?.to ? new Date(input.to) : undefined,
    q: input?.q?.trim() || undefined,
  });
}

export async function listDailyStockReportAction(input: {
  date: string;
  branchId?: string;
}) {
  const session = await requirePermission("reports.view");
  return reportsService.listDailyStock(session.user.tenantId, {
    date: new Date(input.date),
    branchId: input.branchId,
  });
}

export async function listTransfersReportAction(input?: {
  branchId?: string;
  from?: string;
  to?: string;
}) {
  const session = await requirePermission("reports.view");
  return reportsService.listTransfers(session.user.tenantId, {
    branchId: input?.branchId,
    from: input?.from ? new Date(input.from) : undefined,
    to: input?.to ? new Date(input.to) : undefined,
  });
}

export async function listBranchesForReportsAction() {
  const session = await requireAnyPermission([...REPORT_ACCESS]);
  const branches = await branchService.listBranches(session.user.tenantId);
  return branches.map((b) => ({ id: b.id, name: b.name }));
}

export async function exportProcessedOrdersCsvAction(input: {
  processedFrom?: string;
  processedTo?: string;
  branchId?: string;
}) {
  const session = await requireAnyPermission([...REPORT_ACCESS]);

  const csv = await processedOrdersReportService.generateCsv(session.user.tenantId, {
    processedFrom: input.processedFrom ? new Date(input.processedFrom) : undefined,
    processedTo: input.processedTo
      ? new Date(`${input.processedTo}T23:59:59.999Z`)
      : undefined,
    branchId: input.branchId,
  });

  return {
    success: true as const,
    csv,
    filename: `processed-orders-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}

export async function exportDailyStockCsvAction(input: {
  date: string;
  branchId?: string;
}) {
  const session = await requireAnyPermission([...REPORT_ACCESS]);
  if (!input.date) return { error: "Date is required" as const };

  const csv = await dailyStockReportService.generateCsv(session.user.tenantId, {
    date: new Date(input.date),
    branchId: input.branchId,
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
  const session = await requireAnyPermission([...REPORT_ACCESS, "logistics.manage"]);

  const csv = await transferReportService.generateCsv(session.user.tenantId, {
    from: input?.from ? new Date(input.from) : undefined,
    to: input?.to ? new Date(`${input.to}T23:59:59.999Z`) : undefined,
  });

  return {
    success: true as const,
    csv,
    filename: `transfer-report-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}
