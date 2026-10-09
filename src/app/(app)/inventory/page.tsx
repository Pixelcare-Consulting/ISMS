import {
  getInventoryKpisAction,
  getInventorySeriesSummaryAction,
  listInventoryAction,
  listInventoryStatusOptionsAction,
} from "@/features/inventory/actions/inventory.actions";
import { InventoryKpisStrip } from "@/features/inventory/components/inventory-kpis";
import { InventorySeriesSummaryPanel } from "@/features/inventory/components/inventory-series-summary";
import {
  STOCK_UNITS_DEFAULT_SORT,
  STOCK_UNITS_DEFAULT_SORT_DIR,
} from "@/features/inventory/constants/stock-units-sort";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { ModuleGuide } from "@/components/module-guide";
import { INVENTORY_MODULE_GUIDE } from "@/content/module-guides/inventory";
import { requirePermission } from "@/lib/auth/permissions";
import { InventoryTable } from "@/app/(app)/inventory/_components/inventory-table";

interface InventoryPageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    branch?: string;
    sku?: string;
    offPlanogram?: string;
    sort?: string;
    dir?: string;
  }>;
}

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const session = await requirePermission("inventory.view");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const offPlanogram = params.offPlanogram === "1";
  const sort = params.sort ?? STOCK_UNITS_DEFAULT_SORT;
  const sortDir = params.dir ?? STOCK_UNITS_DEFAULT_SORT_DIR;
  const listFilters = {
    page,
    limit,
    branchId: params.branch,
    sku: params.sku,
    // Unchecked / absent = show all STK units (on + off planogram).
    // Only `offPlanogram=1` applies the off-planogram-only filter.
    offPlanogram,
    sort,
    sortDir,
  };
  const summaryFilters = {
    branchId: params.branch,
    sku: params.sku,
    offPlanogram,
  };

  const [result, statusOptions, seriesSummary, kpis] = await Promise.all([
    listInventoryAction(listFilters),
    listInventoryStatusOptionsAction(),
    getInventorySeriesSummaryAction(summaryFilters),
    getInventoryKpisAction(),
  ]);

  const hideBranch = (session.user.roleSlugs ?? []).includes("ps");

  return (
    <div className="space-y-4">
      <ModuleGuide
        title={INVENTORY_MODULE_GUIDE.title}
        description={INVENTORY_MODULE_GUIDE.description}
        storageKey={INVENTORY_MODULE_GUIDE.storageKey}
        defaultOpen
      >
        <InventoryKpisStrip kpis={kpis} />
      </ModuleGuide>
      <InventorySeriesSummaryPanel summary={seriesSummary} />
      <InventoryTable
        result={result}
        statusOptions={statusOptions}
        initialOffPlanogram={offPlanogram}
        initialSort={sort}
        initialSortDir={sortDir}
        hideBranch={hideBranch}
      />
    </div>
  );
}
