import { ProcessedOrdersReportPanel } from "@/app/(app)/reports/processed-orders/_components/processed-orders-report-panel";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function ProcessedOrdersReportPage() {
  await requireAnyPermission(["reports.view", "orders.view"]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Processed orders report"
        description="CSV export of approved order lines for Supply Planning (SO#, approved qty, SPA remarks, CBM)."
      />
      <ProcessedOrdersReportPanel />
    </div>
  );
}
