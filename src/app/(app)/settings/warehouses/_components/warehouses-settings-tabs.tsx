"use client";

import { useRouter } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WarehousesKpisStrip } from "@/app/(app)/settings/warehouses/_components/warehouses-kpis";
import { WarehousesStockPanel } from "@/app/(app)/settings/warehouses/_components/warehouses-stock-panel";
import { WarehousesTable } from "@/app/(app)/settings/warehouses/_components/warehouses-table";

interface LocationRow {
  id: string;
  code: string;
  name: string;
}

interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  isMain: boolean;
  locations: LocationRow[];
  _count: { aors: number; pulloutsDestination: number };
}

export type WarehousesTab = "setup" | "stock";

function hrefForTab(tab: WarehousesTab): string {
  return tab === "stock"
    ? "/settings/warehouses?tab=stock"
    : "/settings/warehouses";
}

export function WarehousesSettingsTabs({
  warehouses,
  activeTab,
}: {
  warehouses: WarehouseRow[];
  activeTab: WarehousesTab;
}) {
  const router = useRouter();

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        const next: WarehousesTab = value === "stock" ? "stock" : "setup";
        if (next === activeTab) return;
        router.push(hrefForTab(next));
      }}
    >
      <TabsList className="gap-2">
        <TabsTrigger value="setup">Warehouses</TabsTrigger>
        <TabsTrigger value="stock">Stock</TabsTrigger>
      </TabsList>
      <TabsContent value="setup" className="space-y-6">
        <WarehousesKpisStrip rows={warehouses} />
        <WarehousesTable warehouses={warehouses} />
      </TabsContent>
      <TabsContent value="stock">
        <WarehousesStockPanel warehouses={warehouses} />
      </TabsContent>
    </Tabs>
  );
}
