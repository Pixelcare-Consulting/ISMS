import { ConsolidatedDiscrepancyReportPanel } from "@/app/(app)/reports/consolidated-discrepancy/_components/consolidated-discrepancy-report-panel";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function ConsolidatedDiscrepancyReportPage() {
  await requireAnyPermission(["reports.view", "inventory.view"]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Consolidated stock discrepancies across branches, sessions, and variance types.
      </SectionPageLead>
      <ConsolidatedDiscrepancyReportPanel />
    </div>
  );
}
