import { listWarehousesAction } from "@/features/warehouses/actions/warehouse.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { WarehousesTable } from "@/app/(app)/settings/warehouses/_components/warehouses-table";

export default async function SettingsWarehousesPage() {
  await requirePermission("branches.manage");
  const warehouses = await listWarehousesAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouses"
        description="Manage warehouse locations and storage aisles (CSV step 4)."
      />
      <WarehousesTable warehouses={warehouses} />
    </div>
  );
}
