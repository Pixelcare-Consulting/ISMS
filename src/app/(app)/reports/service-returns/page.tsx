import { ServiceReturnReportPanel } from "@/app/(app)/reports/service-returns/_components/service-return-report-panel";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function ServiceReturnReportPage() {
  await requireAnyPermission(["reports.view", "sales.create"]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Service return and replacement requests with status and service center details.
      </SectionPageLead>
      <ServiceReturnReportPanel />
    </div>
  );
}
