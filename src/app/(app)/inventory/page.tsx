import {
  listInventoryAction,
  listInventoryStatusOptionsAction,
} from "@/features/inventory/actions/inventory.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { InventoryTable } from "@/app/(app)/inventory/_components/inventory-table";

export default async function InventoryPage() {
  await requirePermission("inventory.view");
  const [rows, statusOptions] = await Promise.all([
    listInventoryAction(),
    listInventoryStatusOptionsAction(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Serialized units by branch. System status codes are configured under Settings → Status."
      />
      <InventoryTable rows={rows} statusOptions={statusOptions} />
    </div>
  );
}
