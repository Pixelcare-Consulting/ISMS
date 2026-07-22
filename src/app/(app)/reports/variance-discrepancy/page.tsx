import { VarianceDiscrepancyReportPanel } from "@/app/(app)/reports/variance-discrepancy/_components/variance-discrepancy-report-panel";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function VarianceDiscrepancyReportPage() {
  await requireAnyPermission(["reports.view", "inventory.view"]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Stock count variances and discrepancies by branch, type, and status.
      </SectionPageLead>
      <VarianceDiscrepancyReportPanel />
    </div>
  );
}
