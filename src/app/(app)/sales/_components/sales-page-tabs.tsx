"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

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
 */
export function SalesPageTabs({
  activeTab,
  showSalesTab,
  showReturnsTab,
  salesContent,
  returnsContent,
}: SalesPageTabsProps) {
  const router = useRouter();
  const showTabList = showSalesTab && showReturnsTab;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        const next: SalesPageTab = value === "returns" ? "returns" : "sales";
        if (next === activeTab) return;
        if (next === "sales" && !showSalesTab) return;
        if (next === "returns" && !showReturnsTab) return;
        router.push(hrefForTab(next));
      }}
    >
      {showTabList ? (
        <TabsList className="gap-2">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="returns">Returns</TabsTrigger>
        </TabsList>
      ) : null}
      {showSalesTab ? (
        <TabsContent value="sales">{salesContent}</TabsContent>
      ) : null}
      {showReturnsTab ? (
        <TabsContent value="returns">{returnsContent}</TabsContent>
      ) : null}
    </Tabs>
  );
}
