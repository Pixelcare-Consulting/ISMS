import { NextResponse } from "next/server";
import { reportsService } from "@/features/reports/services/reports.service";
import { requirePermission } from "@/lib/auth/permissions";
import { getUserBranchIds } from "@/lib/aor/scope";

export async function GET(request: Request) {
  const session = await requirePermission("reports.view");
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const branchIds = (await getUserBranchIds(session.user.tenantId, session.user.id)) ?? [];

  const csv = await reportsService.exportDailyStockCsv(session.user.tenantId, {
    date: new Date(date),
    branchIds,
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="daily-stock-${date}.csv"`,
    },
  });
}
