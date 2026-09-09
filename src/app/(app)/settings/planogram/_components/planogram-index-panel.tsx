"use client";

import { useState } from "react";

import { PlanogramBranchesTable } from "@/app/(app)/settings/planogram/_components/planogram-branches-table";
import { PlanogramKpisStrip } from "@/app/(app)/settings/planogram/_components/planogram-kpis";
import type {
  PlanogramIndexBranch,
  PlanogramIndexKpis,
  PlanogramIndexView,
} from "@/features/planogram/lib/planogram-index";

interface PlanogramIndexPanelProps {
  branches: PlanogramIndexBranch[];
  kpis: PlanogramIndexKpis;
  view: PlanogramIndexView | null;
  initialQuery: string;
  canManage: boolean;
}

export function PlanogramIndexPanel({
  branches,
  kpis,
  view,
  initialQuery,
  canManage,
}: PlanogramIndexPanelProps) {
  const [query, setQuery] = useState(initialQuery);

  return (
    <div className="space-y-6">
      <PlanogramKpisStrip kpis={kpis} view={view} query={query} />
      <PlanogramBranchesTable
        branches={branches}
        view={view}
        query={query}
        onQueryChange={setQuery}
        canManage={canManage}
      />
    </div>
  );
}
