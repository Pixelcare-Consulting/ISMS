import { TransferReportPanel } from "@/app/(app)/reports/transfers/_components/transfer-report-panel";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function TransferReportPage() {
  await requireAnyPermission(["reports.view", "orders.view", "logistics.manage"]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transfer report"
        description="CSV export of branch transfers (number, branches, status, date)."
      />
      <TransferReportPanel />
    </div>
  );
}
