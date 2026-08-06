import {
  getInventoryKpisAction,
  getInventorySeriesSummaryAction,
  listInventoryAction,
  listInventoryStatusOptionsAction,
} from "@/features/inventory/actions/inventory.actions";
import { InventoryKpisStrip } from "@/features/inventory/components/inventory-kpis";
import { InventorySeriesSummaryPanel } from "@/features/inventory/components/inventory-series-summary";
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
    status?: string;
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
  const statusCodeId = params.status || undefined;
  const listFilters = {
    page,
    limit,
    branchId: params.branch,
    sku: params.sku,
    statusCodeId,
    offPlanogram,
    sort: params.sort,
    sortDir: params.dir,
  };
  const summaryFilters = {
    branchId: params.branch,
    sku: params.sku,
    statusCodeId,
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
      <InventoryKpisStrip kpis={kpis} />
      <ModuleGuide {...INVENTORY_MODULE_GUIDE} />
      <InventorySeriesSummaryPanel summary={seriesSummary} />
      <InventoryTable
        result={result}
        statusOptions={statusOptions}
        initialOffPlanogram={offPlanogram}
        initialStatusCodeId={statusCodeId ?? ""}
        initialSort={params.sort ?? ""}
        initialSortDir={params.dir ?? "desc"}
        hideBranch={hideBranch}
      />
    </div>
  );
}
