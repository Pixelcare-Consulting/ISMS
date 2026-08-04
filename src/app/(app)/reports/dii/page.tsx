import { DiiReportPanel } from "@/app/(app)/reports/dii/_components/dii-report-panel";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function DiiReportPage() {
  await requireAnyPermission(["reports.view", "inventory.view"]);

  return <DiiReportPanel />;
}
