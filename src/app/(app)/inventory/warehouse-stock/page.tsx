import {
  listWarehouseFilterOptionsAction,
  listWarehouseInventoryAction,
} from "@/features/warehouse-inventory/actions/warehouse-inventory.actions";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { ModuleGuide } from "@/components/module-guide";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { WAREHOUSE_STOCK_MODULE_GUIDE } from "@/content/module-guides/warehouse-stock";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { WarehouseStockTable } from "@/app/(app)/inventory/warehouse-stock/_components/warehouse-stock-table";

interface WarehouseStockPageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    warehouse?: string;
    location?: string;
    q?: string;
  }>;
}

export default async function WarehouseStockPage({
  searchParams,
}: WarehouseStockPageProps) {
  await requireAnyPermission(["inventory.view", "warehouses.manage"]);
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const warehouseId = params.warehouse || undefined;
  const locationId = params.location || undefined;
  const q = params.q?.trim() || undefined;

  const [result, filterOptions] = await Promise.all([
    listWarehouseInventoryAction({
      page,
      limit,
      warehouseId,
      locationId,
      q,
    }),
    listWarehouseFilterOptionsAction({ warehouseId }),
  ]);

  return (
    <div className="space-y-4">
      <ModuleGuide {...WAREHOUSE_STOCK_MODULE_GUIDE} />
      <SectionPageLead>
        Serial numbers held in warehouses. Branch shelf stock stays under Stock
        units — this list is read-only.
      </SectionPageLead>
      <WarehouseStockTable
        result={result}
        warehouses={filterOptions.warehouses}
        locations={filterOptions.locations}
        currentWarehouseId={warehouseId}
        currentLocationId={locationId}
        currentSearch={q}
      />
    </div>
  );
}
