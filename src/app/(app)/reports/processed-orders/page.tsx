import { ORDER_VIEW_REPORT_PERMISSIONS } from "@/features/orders/constants/order-permissions";
import { ProcessedOrdersReportPanel } from "@/app/(app)/reports/processed-orders/_components/processed-orders-report-panel";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function ProcessedOrdersReportPage() {
  await requireAnyPermission(["reports.view", ...ORDER_VIEW_REPORT_PERMISSIONS]);

  return <ProcessedOrdersReportPanel />;
}
