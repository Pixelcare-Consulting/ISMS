import { AgingReportPanel } from "@/app/(app)/reports/aging/_components/aging-report-panel";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function AgingReportPage() {
  await requireAnyPermission(["reports.view", "inventory.view"]);

  return <AgingReportPanel />;
}
