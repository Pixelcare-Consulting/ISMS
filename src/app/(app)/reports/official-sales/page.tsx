import { listOfficialSalesStagingAction } from "@/features/official-sales/actions/official-sales.actions";
import { hasPermission, requireAnyPermission } from "@/lib/auth/permissions";
import { OfficialSalesPanel } from "@/app/(app)/reports/official-sales/_components/official-sales-panel";

export default async function OfficialSalesPage() {
  const session = await requireAnyPermission([
    "official_sales.view",
    "official_sales.manage",
  ]);
  const rows = await listOfficialSalesStagingAction();
  const canManage = hasPermission(session.user.permissions, "official_sales.manage");

  return <OfficialSalesPanel rows={rows} canManage={canManage} />;
}
