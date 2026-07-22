import { AgingReportPanel } from "@/app/(app)/reports/aging/_components/aging-report-panel";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function AgingReportPage() {
  await requireAnyPermission(["reports.view", "inventory.view"]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Inventory aging by branch, stock age buckets, and serial number details.
      </SectionPageLead>
      <AgingReportPanel />
    </div>
  );
}
