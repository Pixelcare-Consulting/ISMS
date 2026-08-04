import { VarianceDiscrepancyReportPanel } from "@/app/(app)/reports/variance-discrepancy/_components/variance-discrepancy-report-panel";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function VarianceDiscrepancyReportPage() {
  await requireAnyPermission(["reports.view", "inventory.view"]);

  return <VarianceDiscrepancyReportPanel />;
}
