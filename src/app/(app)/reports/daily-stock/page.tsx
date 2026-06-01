import { DailyStockReportPanel } from "@/app/(app)/reports/daily-stock/_components/daily-stock-report-panel";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function DailyStockReportPage() {
  await requireAnyPermission(["reports.view", "orders.view"]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily stock monitoring"
        description="CSV export of planogram SKUs with inventory status counts for a single day."
      />
      <DailyStockReportPanel />
    </div>
  );
}
