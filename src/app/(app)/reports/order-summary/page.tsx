import { OrderSummaryReportPanel } from "@/app/(app)/reports/order-summary/_components/order-summary-report-panel";
import { REPORT_ACCESS } from "@/features/reports/constants/report-access";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function OrderSummaryReportPage() {
  await requireAnyPermission([...REPORT_ACCESS]);

  return <OrderSummaryReportPanel />;
}
