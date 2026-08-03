import { SalesReportPanel } from "@/app/(app)/reports/sales/_components/sales-report-panel";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata(
  "Sales report",
  "Branch sales with serial numbers and ATR/return status.",
);

export default async function SalesReportPage() {
  await requireAnyPermission(["reports.view", "sales.create"]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Branch sales with serial numbers and ATR/return status.
      </SectionPageLead>
      <SalesReportPanel />
    </div>
  );
}
