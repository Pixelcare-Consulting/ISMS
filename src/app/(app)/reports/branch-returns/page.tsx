import { BranchReturnReportPanel } from "@/app/(app)/reports/branch-returns/_components/branch-return-report-panel";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function BranchReturnReportPage() {
  await requireAnyPermission(["reports.view", "sales.create"]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Branch return and replacement requests with status and service details.
      </SectionPageLead>
      <BranchReturnReportPanel />
    </div>
  );
}
