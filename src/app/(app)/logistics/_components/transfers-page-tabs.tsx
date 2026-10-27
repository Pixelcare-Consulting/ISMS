"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TRANSFERS_PAGE_TABS,
  parseTransfersPageTab,
  type TransfersPageTab,
} from "@/features/logistics/constants/transfers-page-tabs";

export type { TransfersPageTab };

interface TransfersPageTabsProps {
  activeTab: TransfersPageTab;
  basePath: string;
  tabs?: readonly TransfersPageTab[];
  transfersContent: ReactNode;
  unitContent: ReactNode;
}

function hrefForTab(basePath: string, tab: TransfersPageTab): string {
  switch (tab) {
    case "transfers":
      return basePath;
    case "unit":
      return `${basePath}?tab=${tab}`;
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

function tabLabel(tab: TransfersPageTab): string {
  switch (tab) {
    case "transfers":
      return "Transfers";
    case "unit":
      return "Unit transfers";
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

function tabSkeleton(tab: TransfersPageTab) {
  switch (tab) {
    case "transfers":
      return (
        <DataTableSkeleton
          columns={["#", "No.", "From → To", "Status", "Actions"]}
          label="Loading transfers"
        />
      );
    case "unit":
      return (
        <DataTableSkeleton
          columns={[
            "#",
            "Transfer No",
            "Delivery",
            "Branch release",
            "Branch receive",
            "Units",
            "Transfer status",
            "SAP IT",
            "Created",
          ]}
          label="Loading unit transfers"
        />
      );
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

export function TransfersPageTabs({
  activeTab,
  basePath,
  tabs = TRANSFERS_PAGE_TABS,
  transfersContent,
  unitContent,
}: TransfersPageTabsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [displayTab, setDisplayTab] = useState<TransfersPageTab>(activeTab);
  const [seededTab, setSeededTab] = useState<TransfersPageTab>(activeTab);
  if (seededTab !== activeTab) {
    setSeededTab(activeTab);
    setDisplayTab(activeTab);
  }

  const contentFor = (tab: TransfersPageTab): ReactNode => {
    switch (tab) {
      case "transfers":
        return transfersContent;
      case "unit":
        return unitContent;
      default: {
        const _exhaustive: never = tab;
        return _exhaustive;
      }
    }
  };

  return (
    <Tabs
      value={displayTab}
      onValueChange={(value) => {
        const next = parseTransfersPageTab(value);
        if (!tabs.includes(next) || next === displayTab) return;
        setDisplayTab(next);
        startTransition(() => {
          router.push(hrefForTab(basePath, next));
        });
      }}
    >
      {/* One tab needs no tab bar. */}
      {tabs.length > 1 ? (
        <TabsList className="gap-2">
          {tabs.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {tabLabel(tab)}
            </TabsTrigger>
          ))}
        </TabsList>
      ) : null}
      {tabs.map((tab) => (
        <TabsContent key={tab} value={tab}>
          {displayTab === tab && (pending || contentFor(tab) == null)
            ? tabSkeleton(tab)
            : contentFor(tab)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
