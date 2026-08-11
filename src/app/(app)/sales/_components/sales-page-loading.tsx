"use client";

import { useSearchParams } from "next/navigation";

import { SalesTabTableSkeleton } from "@/app/(app)/sales/_components/sales-tab-table-skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
 * Sales & ATR route loading shell — keeps page chrome and shows a table skeleton
 * for the active Sales | Returns tab while server data loads.
 */
export function SalesPageLoading() {
  const searchParams = useSearchParams();
  const activeTab =
    searchParams.get("tab") === "returns" ? "returns" : "sales";

  return (
    <div data-app-page-loading className="space-y-6">
      <SalesPageHeaderSkeleton />
      <Tabs value={activeTab}>
        <TabsList className="gap-2">
          <TabsTrigger value="sales" disabled>
            Sales
          </TabsTrigger>
          <TabsTrigger value="returns" disabled>
            Returns
          </TabsTrigger>
        </TabsList>
        <TabsContent value="sales">
          <SalesTabTableSkeleton tab="sales" />
        </TabsContent>
        <TabsContent value="returns">
          <SalesTabTableSkeleton tab="returns" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Suspense fallback before search params are available. */
export function SalesPageLoadingFallback() {
  return (
    <div data-app-page-loading className="space-y-6">
      <SalesPageHeaderSkeleton />
      <SalesTabTableSkeleton tab="sales" />
    </div>
  );
}
