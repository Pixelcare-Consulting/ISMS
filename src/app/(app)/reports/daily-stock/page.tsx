import { DailyStockReportPanel } from "@/app/(app)/reports/daily-stock/_components/daily-stock-report-panel";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function DailyStockReportPage() {
  await requireAnyPermission(["reports.view", "orders.view"]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Planogram SKUs with inventory status counts for a single day.
      </SectionPageLead>
      <DailyStockReportPanel />
    </div>
  );
}
