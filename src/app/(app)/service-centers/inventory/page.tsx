import {
  canManualScStockInAction,
  listScCentersForOpsAction,
  listScInventoryAction,
  listScInventoryStatusOptionsAction,
} from "@/features/service-center-ops/actions/sc-inventory.actions";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { ModuleGuide } from "@/components/module-guide";
import { SC_OPS_MODULE_GUIDE } from "@/content/module-guides/service-center-ops";
import { SC_INVENTORY_PAGE_TUTORIAL } from "@/content/page-tutorials/service-center-ops";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { ScInventoryPanel } from "@/app/(app)/service-centers/inventory/_components/sc-inventory-panel";
import { requirePermission } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata(
  "Service center inventory",
  "Serialized stock at service center locations.",
);

interface PageProps {
  searchParams: Promise<{ page?: string; limit?: string; status?: string }>;
}

export default async function ScInventoryPage({ searchParams }: PageProps) {
  await requirePermission("service_centers.inventory.view");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);

  const [result, centers, statusOptions, canStockIn] = await Promise.all([
    listScInventoryAction({
      page,
      limit,
      statusCodeId: params.status || undefined,
    }),
    listScCentersForOpsAction(),
    listScInventoryStatusOptionsAction(),
    canManualScStockInAction(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service center inventory"
        sticky={false}
        tutorial={SC_INVENTORY_PAGE_TUTORIAL}
        description="AOR-scoped stock at service center locations (separate from branch inventory)."
      />
      <ModuleGuide {...SC_OPS_MODULE_GUIDE} />
      <ScInventoryPanel
        items={result.items}
        centers={centers.map((c) => ({
          id: c.id,
          name: c.name,
          sapCode: c.sapCode,
          locations: c.locations,
        }))}
        statusOptions={statusOptions.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
        }))}
        canStockIn={canStockIn}
      />
    </div>
  );
}
