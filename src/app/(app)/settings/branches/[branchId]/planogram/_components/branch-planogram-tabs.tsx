"use client";

import { useState, type ComponentProps } from "react";

import { AllowedModelsPanel } from "@/app/(app)/settings/branches/[branchId]/planogram/_components/allowed-models-panel";
import { PlanogramTable } from "@/app/(app)/settings/branches/[branchId]/planogram/_components/planogram-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PlanogramTab = "planogram" | "allowed-models";

function isPlanogramTab(value: string): value is PlanogramTab {
  return value === "planogram" || value === "allowed-models";
}

export function BranchPlanogramTabs({
  branchId,
  rows,
  allowedModels,
  canManage,
  offPlanogramSerialCount,
}: {
  branchId: string;
  rows: ComponentProps<typeof PlanogramTable>["rows"];
  allowedModels: ComponentProps<typeof AllowedModelsPanel>["rows"];
  canManage: boolean;
  offPlanogramSerialCount: number;
}) {
  const [tab, setTab] = useState<PlanogramTab>("planogram");

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (isPlanogramTab(value)) setTab(value);
      }}
    >
      <TabsList className="gap-2">
        <TabsTrigger value="planogram">Planogram</TabsTrigger>
        <TabsTrigger value="allowed-models">Allowed models</TabsTrigger>
      </TabsList>
      <TabsContent value="planogram">
        <PlanogramTable
          branchId={branchId}
          rows={rows}
          canManage={canManage}
          offPlanogramSerialCount={offPlanogramSerialCount}
          onOpenAllowedModels={() => setTab("allowed-models")}
        />
      </TabsContent>
      <TabsContent value="allowed-models">
        <AllowedModelsPanel
          branchId={branchId}
          rows={allowedModels}
          canManage={canManage}
        />
      </TabsContent>
    </Tabs>
  );
}
