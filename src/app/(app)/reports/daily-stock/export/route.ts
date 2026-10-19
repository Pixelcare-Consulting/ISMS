import { NextResponse } from "next/server";
import { manilaDayWindow, manilaTodayIso } from "@/features/orders/utils/manila-calendar";
import { reportsService } from "@/features/reports/services/reports.service";
import { requirePermission } from "@/lib/auth/permissions";
import { resolveReportBranchScope } from "@/features/reports/lib/report-branch-scope";

export async function GET(request: Request) {
  const session = await requirePermission("reports.view");
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || manilaTodayIso();
  const day = manilaDayWindow(date);
  if (!day) {
    return NextResponse.json({ error: "Use a valid date (YYYY-MM-DD)" }, { status: 400 });
  }
  const branchIds = await resolveReportBranchScope(
    { tenantId: session.user.tenantId, userId: session.user.id, permissions: session.user.permissions ?? [] },
    "NO_BRANCHES",
  );

  const csv = await reportsService.exportDailyStockCsv(session.user.tenantId, {
    day,
    branchIds,
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="daily-stock-${date}.csv"`,
    },
  });
}
