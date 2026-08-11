"use client";

import { SalesReturnsTable } from "@/app/(app)/sales/_components/sales-returns-table";
import { ScReturnsPanel } from "@/app/(app)/returns/_components/sc-returns-panel";
import type { ReturnsActionCapabilities } from "@/features/returns/constants/returns-permissions";
import type { SalesActionCapabilities } from "@/features/sales/constants/sales-permissions";
import type { listSalesReturnsAction } from "@/features/sales/actions/sales.actions";
import type { listScReturnsAction } from "@/features/service-center-ops/actions/sc-sales.actions";
import { Badge } from "@/components/ui/badge";

type BranchResult = Awaited<ReturnType<typeof listSalesReturnsAction>>;
type ScResult = Awaited<ReturnType<typeof listScReturnsAction>>;

/**
 * Combined Approvals queue: branch + service returns awaiting CS/TL (and restore-ready).
 */
export function ReturnsApprovalsPanel({
  branchResult,
  scItems,
  returnsCapabilities,
  salesCapabilities,
  initialSort,
  initialSortDir,
}: {
  branchResult: BranchResult;
  scItems: ScResult["items"];
  returnsCapabilities: ReturnsActionCapabilities;
  salesCapabilities: SalesActionCapabilities;
  initialSort?: string;
  initialSortDir?: string;
}) {
  const tableCaps = {
    canUpdateSaleHeader: salesCapabilities.canUpdateSaleHeader,
    canCreateSale: salesCapabilities.canCreateSale,
    canRequestReturn: returnsCapabilities.canRequestReturn,
    canEvaluateReturn: returnsCapabilities.canEvaluateReturn,
    canApproveReturn: returnsCapabilities.canApproveReturn,
    canCompleteReturn: returnsCapabilities.canCompleteReturn,
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Branch</h2>
          <Badge variant="secondary">{branchResult.total}</Badge>
        </div>
        <SalesReturnsTable
          result={branchResult}
          capabilities={tableCaps}
          initialSort={initialSort}
          initialSortDir={initialSortDir}
          listTab="approvals"
        />
      </section>
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Service center</h2>
          <Badge variant="secondary">{scItems.length}</Badge>
        </div>
        <ScReturnsPanel
          items={scItems}
          capabilities={returnsCapabilities}
          emptyMessage="No service returns waiting for approval."
        />
      </section>
    </div>
  );
}
