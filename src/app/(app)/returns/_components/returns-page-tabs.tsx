"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";

import { SalesTabTableSkeleton } from "@/app/(app)/sales/_components/sales-tab-table-skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReturnsPageTab } from "@/features/returns/constants/returns-permissions";

interface ReturnsPageTabsProps {
  activeTab: ReturnsPageTab;
  allowedTabs: ReturnsPageTab[];
  branchContent: ReactNode;
  serviceContent: ReactNode;
  approvalsContent: ReactNode;
}

function hrefForTab(tab: ReturnsPageTab): string {
  return `/returns?tab=${tab}`;
}

function tabLabel(tab: ReturnsPageTab): string {
  switch (tab) {
    case "branch":
      return "Branch Returns";
    case "service":
      return "Service Returns";
    case "approvals":
      return "Approvals";
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

/**
 * Branch | Service | Approvals tabs with URL sync.
 * Only permitted tabs are shown; switching resets pagination/sort scope.
 */
export function ReturnsPageTabs({
  activeTab,
  allowedTabs,
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

  if (allowedTabs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have permission to view any Returns tabs. Ask an admin to
        grant Branch Returns, Service Returns, or Approvals access.
      </p>
    );
  }

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
        if (!allowedTabs.includes(next) || next === displayTab) return;
        setDisplayTab(next);
        startTransition(() => {
          router.push(hrefForTab(next));
        });
      }}
    >
      <TabsList className="gap-2">
        {allowedTabs.map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {tabLabel(tab)}
          </TabsTrigger>
        ))}
      </TabsList>
      {allowedTabs.includes("branch") ? (
        <TabsContent value="branch">
          {displayTab === "branch" && showSkeleton ? (
            <SalesTabTableSkeleton tab="returns" />
          ) : (
            branchContent
          )}
        </TabsContent>
      ) : null}
      {allowedTabs.includes("service") ? (
        <TabsContent value="service">
          {displayTab === "service" && showSkeleton ? (
            <SalesTabTableSkeleton tab="returns" />
          ) : (
            serviceContent
          )}
        </TabsContent>
      ) : null}
      {allowedTabs.includes("approvals") ? (
        <TabsContent value="approvals">
          {displayTab === "approvals" && showSkeleton ? (
            <SalesTabTableSkeleton tab="returns" />
          ) : (
            approvalsContent
          )}
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
