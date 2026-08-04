import { LOGISTICS_ACCESS_PERMISSIONS } from "@/features/logistics/constants/logistics-permissions";
import { ORDER_VIEW_REPORT_PERMISSIONS } from "@/features/orders/constants/order-permissions";
import { TransferReportPanel } from "@/app/(app)/reports/transfers/_components/transfer-report-panel";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function TransferReportPage() {
  await requireAnyPermission([
    "reports.view",
    ...ORDER_VIEW_REPORT_PERMISSIONS,
    ...LOGISTICS_ACCESS_PERMISSIONS,
  ]);

  return <TransferReportPanel />;
}
