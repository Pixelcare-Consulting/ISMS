import { ProcessedOrdersReportPanel } from "@/app/(app)/reports/processed-orders/_components/processed-orders-report-panel";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function ProcessedOrdersReportPage() {
  await requireAnyPermission(["reports.view", "orders.view"]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        CSV export of approved order lines (SO#, approved qty, SPA remarks, CBM).
      </SectionPageLead>
      <ProcessedOrdersReportPanel />
    </div>
  );
}
