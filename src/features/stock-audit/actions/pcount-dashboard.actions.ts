"use server";

import ExcelJS from "exceljs";

import {
  hasPermission,
  requireAnyPermission,
} from "@/lib/auth/permissions";
import { aorService } from "@/features/aors/services/aor.service";
import {
  pcountDashboardService,
  type PcountDashboardOverview,
} from "@/features/stock-audit/services/pcount-dashboard.service";

const PCOUNT_DASHBOARD_ACCESS = ["inventory.view", "reports.view"] as const;

function isUnrestricted(permissions: string[] | undefined) {
  return (
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "master_data.manage")
  );
}

async function requirePcountDashboardAccess() {
  const session = await requireAnyPermission([...PCOUNT_DASHBOARD_ACCESS]);
  return {
    session,
    unrestricted: isUnrestricted(session.user.permissions),
  };
}

export async function getPcountDashboardOverviewAction(input?: {
  period?: string;
  dealerId?: string;
}): Promise<PcountDashboardOverview> {
  const { session, unrestricted } = await requirePcountDashboardAccess();
  return pcountDashboardService.getOverview(
    session.user.tenantId,
    session.user.id,
    unrestricted,
    {
      period: input?.period,
      dealerId: input?.dealerId || undefined,
    },
  );
}

export async function getPcountBranchDetailAction(branchId: string) {
  const { session, unrestricted } = await requirePcountDashboardAccess();
  if (!branchId) return { error: "Branch is required" as const };
  const detail = await pcountDashboardService.getBranchDetail(
    session.user.tenantId,
    session.user.id,
    unrestricted,
    branchId,
  );
  if (!detail) return { error: "Branch not found or not in your area" as const };
  return {
    detail,
    canManage: hasPermission(session.user.permissions, "inventory.manage"),
  };
}

export async function exportPcountDashboardExcelAction(input?: {
  period?: string;
  dealerId?: string;
}): Promise<{ base64: string; filename: string } | { error: string }> {
  const { session, unrestricted } = await requirePcountDashboardAccess();

  try {
    const overview = await pcountDashboardService.getOverview(
      session.user.tenantId,
      session.user.id,
      unrestricted,
      {
        period: input?.period,
        dealerId: input?.dealerId || undefined,
      },
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ISMS";
    const sheet = workbook.addWorksheet("P-Count progress");
    sheet.columns = [
      { header: "Dealer / Group code", key: "groupCode", width: 18 },
      { header: "Dealer / Group name", key: "groupName", width: 28 },
      { header: "Branch SAP", key: "branchSap", width: 14 },
      { header: "Branch", key: "branchName", width: 36 },
      { header: "Counting", key: "counting", width: 18 },
      { header: "Posting", key: "posting", width: 22 },
      { header: "Done this month", key: "done", width: 14 },
      { header: "Latest session", key: "sessionNo", width: 18 },
      { header: "Last count by", key: "lastBy", width: 22 },
      { header: "Last closed", key: "lastClosed", width: 18 },
    ];

    const header = sheet.getRow(1);
    header.font = { bold: true };

    for (const group of overview.groups) {
      for (const branch of group.branches) {
        sheet.addRow({
          groupCode: group.groupCode,
          groupName: group.groupName,
          branchSap: branch.branchSapCode,
          branchName: branch.branchName,
          counting: branch.counting,
          posting: branch.posting,
          done: branch.isDone ? "Yes" : "No",
          sessionNo: branch.latestSessionNo ?? "",
          lastBy: branch.lastCountByName ?? "",
          lastClosed: branch.lastClosedAt
            ? branch.lastClosedAt.toISOString().slice(0, 16).replace("T", " ")
            : "",
        });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const periodTag = `${overview.period.year}-${String(overview.period.month).padStart(2, "0")}`;
    return {
      base64,
      filename: `pcount-dashboard-${periodTag}.xlsx`,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to export P-Count dashboard",
    };
  }
}

/** Soft check used by UI to know if AOR is empty (show permission dialog). */
export async function hasPcountDashboardBranchAccessAction(): Promise<boolean> {
  const { session, unrestricted } = await requirePcountDashboardAccess();
  if (unrestricted) return true;
  const branchIds = await aorService.getBranchIdsForUser(
    session.user.tenantId,
    session.user.id,
  );
  return branchIds.length > 0;
}
