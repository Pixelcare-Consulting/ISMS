import {
  listInventoryAction,
  listInventoryStatusOptionsAction,
} from "@/features/inventory/actions/inventory.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { InventoryTable } from "@/app/(app)/inventory/_components/inventory-table";

interface InventoryPageProps {
  searchParams: Promise<{
    page?: string;
    branch?: string;
    sku?: string;
    offPlanogram?: string;
  }>;
}

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  await requirePermission("inventory.view");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const [result, statusOptions] = await Promise.all([
    listInventoryAction({
      page,
      branchId: params.branch,
      sku: params.sku,
      offPlanogram: params.offPlanogram === "1",
    }),
    listInventoryStatusOptionsAction(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Serialized units by branch. Planogram badge shows whether each SKU is authorized at that branch."
      />
      <InventoryTable
        result={result}
        statusOptions={statusOptions}
        initialOffPlanogram={params.offPlanogram === "1"}
      />
    </div>
  );
}
