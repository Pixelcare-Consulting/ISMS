import { SalesReportPanel } from "@/app/(app)/reports/sales/_components/sales-report-panel";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata(
  "Sales & ATRs",
  "Branch sales with serial numbers and ATR/return status.",
);

export default async function SalesReportPage() {
  await requireAnyPermission(["reports.view", "sales.create"]);

  return <SalesReportPanel />;
}
