import { NextResponse } from "next/server";

import { salesReportService } from "@/features/reports/services/sales-report.service";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { getUserBranchIds } from "@/lib/aor/scope";

export async function GET(request: Request) {
  const session = await requireAnyPermission(["reports.view", "sales.create"]);
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const branchIds = (await getUserBranchIds(session.user.tenantId, session.user.id)) ?? [];

  const csv = await salesReportService.generateCsv(session.user.tenantId, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
    branchIds,
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
