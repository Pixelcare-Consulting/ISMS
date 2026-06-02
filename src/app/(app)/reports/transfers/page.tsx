import { TransferReportPanel } from "@/app/(app)/reports/transfers/_components/transfer-report-panel";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function TransferReportPage() {
  await requireAnyPermission(["reports.view", "orders.view", "logistics.manage"]);

  return (
    <div className="space-y-4">
      <SectionPageLead>Branch transfers — number, branches, status, date.</SectionPageLead>
      <TransferReportPanel />
    </div>
  );
}
