import { PageHeader } from "@/app/(app)/_components/page-header";
import { InventoryApprovalsTable } from "@/app/(app)/audit-logs/inventory-approvals/_components/inventory-approvals-table";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { listInventoryApprovalsAction } from "@/features/inventory-approvals/actions/inventory-approval.actions";
import { INVENTORY_APPROVAL_VIEW } from "@/features/inventory-approvals/constants/inventory-approval-display";
import { requirePermission } from "@/lib/auth/permissions";

interface InventoryApprovalsPageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    status?: string;
    source?: string;
    q?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}

export default async function InventoryApprovalsPage({ searchParams }: InventoryApprovalsPageProps) {
  await requirePermission(INVENTORY_APPROVAL_VIEW);
  const params = await searchParams;

  const result = await listInventoryApprovalsAction({
    page: Number(params.page) || 1,
    limit: parseTablePageSize(params.limit),
    status: params.status,
    sourceType: params.source,
    q: params.q,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Approvals"
        description="Read-only trace of each unit's approvals: who decided, when, and the current status."
        sticky={false}
      />
      <InventoryApprovalsTable
        result={{
          items: result.items,
          total: result.total,
          page: result.page,
          pageSize: result.limit,
          totalPages: result.totalPages,
        }}
        currentStatus={params.status}
        currentSource={params.source}
        currentSearch={params.q}
        currentDateFrom={params.dateFrom}
        currentDateTo={params.dateTo}
      />
    </div>
  );
}
