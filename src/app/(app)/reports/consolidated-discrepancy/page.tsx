import { ConsolidatedDiscrepancyReportPanel } from "@/app/(app)/reports/consolidated-discrepancy/_components/consolidated-discrepancy-report-panel";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function ConsolidatedDiscrepancyReportPage() {
  await requireAnyPermission(["reports.view", "inventory.view"]);

  return <ConsolidatedDiscrepancyReportPanel />;
}
