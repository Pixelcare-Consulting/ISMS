"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";

import { SalesTabTableSkeleton } from "@/app/(app)/sales/_components/sales-tab-table-skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type SalesPageTab = "sales" | "returns";

interface SalesPageTabsProps {
  activeTab: SalesPageTab;
  showSalesTab: boolean;
  showReturnsTab: boolean;
  salesContent: ReactNode;
  returnsContent: ReactNode;
}

function hrefForTab(tab: SalesPageTab): string {
  return tab === "returns" ? "/sales?tab=returns" : "/sales";
}

/**
 * Sales | Returns in-page tabs with URL sync (?tab=sales|returns).
 * Switching tabs resets pagination/sort so each tab stays scoped.
 * Tab triggers are gated by `sales.view`/`sales.create` vs `sales.return.view`.
 * Shows a table skeleton while the next tab's server data loads.
 */
export function SalesPageTabs({
  activeTab,
  showSalesTab,
  showReturnsTab,
  salesContent,
  returnsContent,
}: SalesPageTabsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [displayTab, setDisplayTab] = useState<SalesPageTab>(activeTab);
  const showTabList = showSalesTab && showReturnsTab;

  useEffect(() => {
    setDisplayTab(activeTab);
  }, [activeTab]);

  const showSalesSkeleton =
    displayTab === "sales" && (pending || salesContent == null);
  const showReturnsSkeleton =
    displayTab === "returns" && (pending || returnsContent == null);

  return (
    <Tabs
      value={displayTab}
      onValueChange={(value) => {
        const next: SalesPageTab = value === "returns" ? "returns" : "sales";
        if (next === displayTab) return;
        if (next === "sales" && !showSalesTab) return;
        if (next === "returns" && !showReturnsTab) return;
        setDisplayTab(next);
        startTransition(() => {
          router.push(hrefForTab(next));
        });
      }}
    >
      {showTabList ? (
        <TabsList className="gap-2">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="returns">Returns</TabsTrigger>
        </TabsList>
      ) : null}
      {showSalesTab ? (
        <TabsContent value="sales">
          {showSalesSkeleton ? (
            <SalesTabTableSkeleton tab="sales" />
          ) : (
            salesContent
          )}
        </TabsContent>
      ) : null}
      {showReturnsTab ? (
        <TabsContent value="returns">
          {showReturnsSkeleton ? (
            <SalesTabTableSkeleton tab="returns" />
          ) : (
            returnsContent
          )}
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
