import { ServiceReturnReportPanel } from "@/app/(app)/reports/service-returns/_components/service-return-report-panel";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function ServiceReturnReportPage() {
  await requireAnyPermission(["reports.view", "sales.create"]);

  return <ServiceReturnReportPanel />;
}
