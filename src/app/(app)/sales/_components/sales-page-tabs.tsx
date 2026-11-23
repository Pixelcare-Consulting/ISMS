"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { SalesTabTableSkeleton } from "@/app/(app)/sales/_components/sales-tab-table-skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildSalesPageHref,
  type SalesPageTab,
} from "@/features/sales/utils/sales-page-href";

interface SalesPageTabsProps {
  activeTab: SalesPageTab;
  allowedTabs: SalesPageTab[];
  /** Content of the active tab; the server renders only that one. */
  children: ReactNode;
}

const TAB_LABELS: Record<SalesPageTab, string> = {
  branch: "Branch",
  "service-center": "Service Center",
};

/**
 * Branch | Service Center tabs with URL sync. Only permitted tabs are shown; a single tab
 * shows no tab bar. Switching resets paging, sort, status, and search.
 */
export function SalesPageTabs({ activeTab, allowedTabs, children }: SalesPageTabsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // The tab shown right now leads the URL while the router catches up; re-synced when the
  // route settles on another tab (back / forward).
  const [displayTab, setDisplayTab] = useState<SalesPageTab>(activeTab);
  const [seededTab, setSeededTab] = useState<SalesPageTab>(activeTab);
  if (seededTab !== activeTab) {
    setSeededTab(activeTab);
    setDisplayTab(activeTab);
  }

  if (allowedTabs.length < 2) return <>{children}</>;

  return (
    <Tabs
      value={displayTab}
      onValueChange={(value) => {
        const next = allowedTabs.find((tab) => tab === value);
        if (!next || next === displayTab) return;
        setDisplayTab(next);
        startTransition(() => {
          router.push(buildSalesPageHref({ tab: next }));
        });
      }}
    >
      <TabsList className="gap-2">
        {allowedTabs.map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {TAB_LABELS[tab]}
          </TabsTrigger>
        ))}
      </TabsList>
      {allowedTabs.map((tab) => (
        <TabsContent key={tab} value={tab} className="space-y-6">
          {tab !== displayTab ? null : pending || tab !== activeTab ? (
            <SalesTabTableSkeleton tab="sales" />
          ) : (
            children
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
