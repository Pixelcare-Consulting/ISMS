"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ORDERS_PAGE_TABS,
  parseOrdersPageTab,
  type OrdersPageTab,
} from "@/features/orders/constants/orders-page-tabs";

export type { OrdersPageTab };

interface OrdersPageTabsProps {
  activeTab: OrdersPageTab;
  basePath: string;
  tabs?: readonly OrdersPageTab[];
  ordersContent: ReactNode;
  analyticsContent?: ReactNode;
  historyContent: ReactNode;
}

function hrefForTab(basePath: string, tab: OrdersPageTab): string {
  if (tab === "orders") return basePath;
  return `${basePath}?tab=${tab}`;
}

function tabLabel(tab: OrdersPageTab): string {
  switch (tab) {
    case "orders":
      return "Orders";
    case "analytics":
      return "Order Analytics";
    case "history":
      return "Order History";
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

function tabSkeleton(tab: OrdersPageTab) {
  switch (tab) {
    case "orders":
      return (
        <DataTableSkeleton
          columns={["#", "Order #", "Branch", "Type", "Status", "Lines"]}
          label="Loading orders"
        />
      );
    case "analytics":
      return (
        <DataTableSkeleton
          columns={["Model", "INV", "SALES", "RATE", "MIL QTY", "MIL AMT", "SUG QTY"]}
          label="Loading order analytics"
        />
      );
    case "history":
      return (
        <DataTableSkeleton
          columns={[
            "SO#",
            "Type",
            "Branch",
            "Order Qty",
            "Total Amt",
            "App Qty",
            "App Amt",
            "Date",
            "Last updated by",
            "Status",
          ]}
          label="Loading order history"
        />
      );
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

export function OrdersPageTabs({
  activeTab,
  basePath,
  tabs = ORDERS_PAGE_TABS,
  ordersContent,
  analyticsContent,
  historyContent,
}: OrdersPageTabsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [displayTab, setDisplayTab] = useState<OrdersPageTab>(activeTab);
  const [seededTab, setSeededTab] = useState<OrdersPageTab>(activeTab);
  if (seededTab !== activeTab) {
    setSeededTab(activeTab);
    setDisplayTab(activeTab);
  }

  const contentFor = (tab: OrdersPageTab): ReactNode => {
    switch (tab) {
      case "orders":
        return ordersContent;
      case "analytics":
        return analyticsContent;
      case "history":
        return historyContent;
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
        const next = parseOrdersPageTab(value, tabs);
        if (next === displayTab) return;
        setDisplayTab(next);
        startTransition(() => {
          router.push(hrefForTab(basePath, next));
        });
      }}
    >
      <TabsList className="gap-2">
        {tabs.map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {tabLabel(tab)}
          </TabsTrigger>
        ))}
      </TabsList>
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
