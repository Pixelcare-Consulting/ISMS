import { LOGISTICS_ACCESS_PERMISSIONS } from "@/features/logistics/constants/logistics-permissions";
import { PullOutReportPanel } from "@/app/(app)/reports/pull-outs/_components/pull-out-report-panel";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function PullOutReportPage() {
  await requireAnyPermission(["reports.view", ...LOGISTICS_ACCESS_PERMISSIONS]);

  return <PullOutReportPanel />;
}
