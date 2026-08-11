import {
  getOfficialSalesKpisAction,
  listOfficialSalesStagingAction,
} from "@/features/official-sales/actions/official-sales.actions";
import { OfficialSalesKpisStrip } from "@/features/official-sales/components/official-sales-kpis";
import { hasPermission, requireAnyPermission } from "@/lib/auth/permissions";
import { OfficialSalesPanel } from "@/app/(app)/reports/official-sales/_components/official-sales-panel";

export default async function OfficialSalesPage() {
  const session = await requireAnyPermission([
    "official_sales.view",
    "official_sales.manage",
  ]);
  const [rows, kpis] = await Promise.all([
    listOfficialSalesStagingAction(),
    getOfficialSalesKpisAction(),
  ]);
  const canManage = hasPermission(session.user.permissions, "official_sales.manage");

  return (
    <div className="space-y-6">
      <OfficialSalesKpisStrip kpis={kpis} />
      <OfficialSalesPanel rows={rows} canManage={canManage} />
    </div>
  );
}
