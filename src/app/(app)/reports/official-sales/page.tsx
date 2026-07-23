import { listOfficialSalesStagingAction } from "@/features/official-sales/actions/official-sales.actions";
import { hasPermission, requireAnyPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { OfficialSalesPanel } from "@/app/(app)/reports/official-sales/_components/official-sales-panel";

export default async function OfficialSalesPage() {
  const session = await requireAnyPermission([
    "official_sales.view",
    "official_sales.manage",
  ]);
  const rows = await listOfficialSalesStagingAction();
  const canManage = hasPermission(session.user.permissions, "official_sales.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Official Sales"
        description="Upload dealer DR files to a staging table, then process SALE (STK→SLD) or RETURN (SLD/RSV→STK) per serial."
      />
      <OfficialSalesPanel rows={rows} canManage={canManage} />
    </div>
  );
}
