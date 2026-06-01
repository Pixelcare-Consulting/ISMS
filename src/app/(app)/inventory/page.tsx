import {
  listInventoryAction,
  listInventoryStatusOptionsAction,
} from "@/features/inventory/actions/inventory.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { InventoryTable } from "@/app/(app)/inventory/_components/inventory-table";

interface InventoryPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  await requirePermission("inventory.view");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const [result, statusOptions] = await Promise.all([
    listInventoryAction({ page }),
    listInventoryStatusOptionsAction(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Serialized units by branch. System status codes are configured under Settings → Status."
      />
      <InventoryTable result={result} statusOptions={statusOptions} />
    </div>
  );
}
