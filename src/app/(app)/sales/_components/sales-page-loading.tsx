import { SalesTabTableSkeleton } from "@/app/(app)/sales/_components/sales-tab-table-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

function SalesPageHeaderSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-full max-w-xl" />
    </div>
  );
}

/**
 * Sales route loading shell — page chrome + sales table skeleton while server data loads.
 * Returns live under `/returns`; this shell must not show a Returns tab.
 */
export function SalesPageLoading() {
  return (
    <div data-app-page-loading className="space-y-6">
      <SalesPageHeaderSkeleton />
      <SalesTabTableSkeleton tab="sales" />
    </div>
  );
}
