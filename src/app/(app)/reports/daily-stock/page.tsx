import { ORDER_VIEW_REPORT_PERMISSIONS } from "@/features/orders/constants/order-permissions";
import { DailyStockReportPanel } from "@/app/(app)/reports/daily-stock/_components/daily-stock-report-panel";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function DailyStockReportPage() {
  await requireAnyPermission(["reports.view", ...ORDER_VIEW_REPORT_PERMISSIONS]);

  return <DailyStockReportPanel />;
}
