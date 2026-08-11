"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";

import { SalesTabTableSkeleton } from "@/app/(app)/sales/_components/sales-tab-table-skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ReturnsPageTab = "branch" | "service" | "approvals";

interface ReturnsPageTabsProps {
  activeTab: ReturnsPageTab;
  branchContent: ReactNode;
  serviceContent: ReactNode;
  approvalsContent: ReactNode;
}

function hrefForTab(tab: ReturnsPageTab): string {
  return `/returns?tab=${tab}`;
}

/**
 * Branch | Service | Approvals tabs with URL sync.
 * Switching tabs resets pagination/sort so each tab stays scoped.
 */
export function ReturnsPageTabs({
  activeTab,
  branchContent,
  serviceContent,
  approvalsContent,
}: ReturnsPageTabsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [displayTab, setDisplayTab] = useState<ReturnsPageTab>(activeTab);

  useEffect(() => {
    setDisplayTab(activeTab);
  }, [activeTab]);

  const showSkeleton =
    pending ||
    (displayTab === "branch" && branchContent == null) ||
    (displayTab === "service" && serviceContent == null) ||
    (displayTab === "approvals" && approvalsContent == null);

  return (
    <Tabs
      value={displayTab}
      onValueChange={(value) => {
        const next: ReturnsPageTab =
          value === "service"
            ? "service"
            : value === "approvals"
              ? "approvals"
              : "branch";
        if (next === displayTab) return;
        setDisplayTab(next);
        startTransition(() => {
          router.push(hrefForTab(next));
        });
      }}
    >
      <TabsList className="gap-2">
        <TabsTrigger value="branch">Branch Returns</TabsTrigger>
        <TabsTrigger value="service">Service Returns</TabsTrigger>
        <TabsTrigger value="approvals">Approvals</TabsTrigger>
      </TabsList>
      <TabsContent value="branch">
        {displayTab === "branch" && showSkeleton ? (
          <SalesTabTableSkeleton tab="returns" />
        ) : (
          branchContent
        )}
      </TabsContent>
      <TabsContent value="service">
        {displayTab === "service" && showSkeleton ? (
          <SalesTabTableSkeleton tab="returns" />
        ) : (
          serviceContent
        )}
      </TabsContent>
      <TabsContent value="approvals">
        {displayTab === "approvals" && showSkeleton ? (
          <SalesTabTableSkeleton tab="returns" />
        ) : (
          approvalsContent
        )}
      </TabsContent>
    </Tabs>
  );
}
