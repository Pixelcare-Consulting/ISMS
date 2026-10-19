import { NextResponse } from "next/server";
import { reportsService } from "@/features/reports/services/reports.service";
import { requirePermission } from "@/lib/auth/permissions";
import { resolveReportBranchScope } from "@/features/reports/lib/report-branch-scope";

export async function GET(request: Request) {
  const session = await requirePermission("reports.view");
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const branchIds = await resolveReportBranchScope(
    { tenantId: session.user.tenantId, userId: session.user.id, permissions: session.user.permissions ?? [] },
    "NO_BRANCHES",
  );

  const csv = await reportsService.exportTransfersCsv(session.user.tenantId, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    branchIds,
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transfer-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
