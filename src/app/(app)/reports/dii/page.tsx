import { DiiReportPanel } from "@/app/(app)/reports/dii/_components/dii-report-panel";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function DiiReportPage() {
  await requireAnyPermission(["reports.view", "inventory.view"]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Days in inventory (DII) by branch, stock age, and serial number details.
      </SectionPageLead>
      <DiiReportPanel />
    </div>
  );
}
