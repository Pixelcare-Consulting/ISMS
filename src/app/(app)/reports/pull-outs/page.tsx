import { PullOutReportPanel } from "@/app/(app)/reports/pull-outs/_components/pull-out-report-panel";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function PullOutReportPage() {
  await requireAnyPermission(["reports.view", "logistics.manage"]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Branch pull-outs from branch to warehouse with status and reason details.
      </SectionPageLead>
      <PullOutReportPanel />
    </div>
  );
}
