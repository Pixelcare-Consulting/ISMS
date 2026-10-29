import {
  getInventoryKpisAction,
  getInventorySeriesSummaryAction,
  listInventoryAction,
  listInventoryGroupsAction,
} from "@/features/inventory/actions/inventory.actions";
import { InventoryKpisStrip } from "@/features/inventory/components/inventory-kpis";
import { InventorySeriesSummaryPanel } from "@/features/inventory/components/inventory-series-summary";
import {
  STOCK_UNITS_DEFAULT_SORT,
  STOCK_UNITS_DEFAULT_SORT_DIR,
} from "@/features/inventory/constants/stock-units-sort";
import {
  isGroupedStockUnitsView,
  parseStockUnitsView,
} from "@/features/inventory/constants/stock-units-view";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { ModuleGuide } from "@/components/module-guide";
import { INVENTORY_MODULE_GUIDE } from "@/content/module-guides/inventory";
import { canSyncFromSap } from "@/features/sap/constants/sap-permissions";
import { requirePermission } from "@/lib/auth/permissions";
import { InventoryGroupedTable } from "@/app/(app)/inventory/_components/inventory-grouped-table";
import { InventoryTable } from "@/app/(app)/inventory/_components/inventory-table";

interface InventoryPageProps {
  searchParams: Promise<{
    view?: string;
    page?: string;
    limit?: string;
    branch?: string;
    sku?: string;
    offPlanogram?: string;
    sort?: string;
    dir?: string;
    q?: string;
  }>;
}

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const session = await requirePermission("inventory.view");
  const params = await searchParams;
  const view = parseStockUnitsView(params.view);
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const offPlanogram = params.offPlanogram === "1";
  const sort = params.sort ?? STOCK_UNITS_DEFAULT_SORT;
  const sortDir = params.dir ?? STOCK_UNITS_DEFAULT_SORT_DIR;
  const searchQuery = params.q?.trim() ?? "";

  const summaryFilters = {
    branchId: params.branch,
    sku: params.sku,
    offPlanogram,
  };

  const hideBranch = (session.user.roleSlugs ?? []).includes("ps");
  const canSync = canSyncFromSap(session.user.permissions);

  const [seriesSummary, kpis] = await Promise.all([
    getInventorySeriesSummaryAction(summaryFilters),
    getInventoryKpisAction(),
  ]);

  if (view === "all") {
    const listFilters = {
      page,
      limit,
      branchId: params.branch,
      sku: params.sku,
      offPlanogram,
      sort,
      sortDir,
    };
    const result = await listInventoryAction(listFilters);

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
          initialOffPlanogram={offPlanogram}
          initialSort={sort}
          initialSortDir={sortDir}
          hideBranch={hideBranch}
          canSync={canSync}
        />
      </div>
    );
  }

  const groupBy = isGroupedStockUnitsView(view) ? view : "by-branch";
  const groupResult = await listInventoryGroupsAction({
    groupBy,
    page,
    limit,
    branchId: params.branch,
    sku: params.sku,
    offPlanogram,
    q: searchQuery || undefined,
  });

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
      <InventoryGroupedTable
        key={`${groupBy}:${page}:${limit}:${params.branch ?? ""}:${params.sku ?? ""}:${offPlanogram ? "1" : "0"}:${searchQuery}`}
        groupBy={groupBy}
        result={groupResult}
        initialOffPlanogram={offPlanogram}
        initialSearch={searchQuery}
        hideBranch={hideBranch}
        canSync={canSync}
      />
    </div>
  );
}
