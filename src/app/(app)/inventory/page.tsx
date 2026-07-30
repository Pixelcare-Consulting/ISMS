import {
  getInventoryKpisAction,
  listInventoryAction,
  listInventoryStatusOptionsAction,
} from "@/features/inventory/actions/inventory.actions";
import { InventoryKpisStrip } from "@/features/inventory/components/inventory-kpis";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { InventoryTable } from "@/app/(app)/inventory/_components/inventory-table";

interface InventoryPageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    branch?: string;
    sku?: string;
    offPlanogram?: string;
  }>;
}

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  await requirePermission("inventory.view");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const [result, statusOptions, kpis] = await Promise.all([
    listInventoryAction({
      page,
      limit,
      branchId: params.branch,
      sku: params.sku,
      offPlanogram: params.offPlanogram === "1",
    }),
    listInventoryStatusOptionsAction(),
    getInventoryKpisAction(),
  ]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Serialized units by branch. Planogram badge shows authorized SKUs per branch.
      </SectionPageLead>
      <InventoryKpisStrip kpis={kpis} />
      <InventoryTable
        result={result}
        statusOptions={statusOptions}
        initialOffPlanogram={params.offPlanogram === "1"}
      />
    </div>
  );
}
