"use client";

import Link from "next/link";

import { useRouter } from "next/navigation";

import { useRef, useTransition } from "react";

import { toast } from "sonner";

import {
  generateSuggestedOrdersAction,
  importBrsCsvAction,
  runAllocationAction,
  submitSuggestedOrdersAction,
} from "@/features/forecast/actions/forecast.actions";

import { AllocationGapsTable } from "@/features/forecast/components/allocation-gaps-table";

import { useTableSelection } from "@/components/data-table/use-table-selection";
import { GlobalDataTable, GlobalTableHead } from "@/lib/data-table";
import { KpiCard } from "@/lib/kpi-cards";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PlanningPanelProps {
  period: {
    id: string;

    label: string;

    isActive: boolean;

    _count?: { allocations: number };
  } | null;

  gapCount: number;

  draftOrders: number;

  targets: {
    id: string;

    revenueLabel: string;

    branch: { name: string; sapCode: string };
  }[];

  gapsResult: {
    items: {
      id: string;

      gapQty: number;

      planogramMax: number;

      currentStock: number;

      branch: { name: string };

      model: { skuCode: string; name: string };
    }[];

    total: number;

    page: number;

    totalPages: number;
  };

  branches: { id: string; name: string }[];

  currentBranch?: string;

  currentQ?: string;
}

export function PlanningPanel({
  period,

  gapCount,

  draftOrders,

  targets,

  gapsResult,

  branches,

  currentBranch,

  currentQ,
}: PlanningPanelProps) {
  const router = useRouter();

  const fileRef = useRef<HTMLInputElement>(null);

  const [pending, startTransition] = useTransition();
  const targetSelection = useTableSelection(targets.map((target) => target.id));

  function runAction(
    label: string,
    fn: () => Promise<{ error?: string; success?: boolean }>,
  ) {
    startTransition(async () => {
      const result = await fn();

      if (result.error) {
        toast.error(result.error);

        return;
      }

      toast.success(label);

      router.refresh();
    });
  }

  function handleCsvUpload(formData: FormData) {
    startTransition(async () => {
      const result = await importBrsCsvAction(formData);

      if (result.error) {
        toast.error(result.error);

        return;
      }

      if (!("label" in result)) return;

      toast.success(`Imported period ${result.label}`);

      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Active period" value={period?.label ?? "None"} />

        <KpiCard label="Allocation gaps" value={String(gapCount)} />

        <KpiCard label="Draft suggestions" value={String(draftOrders)} />

        <KpiCard
          label="Allocation rows"
          value={String(period?._count?.allocations ?? 0)}
        />
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1.5 shadow-sm">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];

            if (!file) return;

            const fd = new FormData();

            fd.set("file", file);

            handleCsvUpload(fd);

            e.target.value = "";
          }}
        />

        <Button
          size="sm"
          variant="outline"
          className="rounded-lg"
          disabled={pending}
          onClick={() => fileRef.current?.click()}
        >
          Upload forecast CSV
        </Button>

        {period ? (
          <>
            <Button
              size="sm"
              className="rounded-lg"
              disabled={pending}
              onClick={() =>
                runAction("Allocation computed", () =>
                  runAllocationAction(period.id),
                )
              }
            >
              Run allocation
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="rounded-lg"
              disabled={pending}
              onClick={() =>
                runAction("Suggested orders created", () =>
                  generateSuggestedOrdersAction(period.id),
                )
              }
            >
              Generate suggested orders
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="rounded-lg"
              disabled={pending || draftOrders === 0}
              onClick={() =>
                runAction("Submitted for TL review", () =>
                  submitSuggestedOrdersAction(),
                )
              }
            >
              Submit drafts for TL review
            </Button>
          </>
        ) : null}

        <Button size="sm" variant="outline" className="rounded-lg" asChild>
          <Link href="/planning/suggested-orders">View suggested orders</Link>
        </Button>
      </div>

      {period ? (
        <>
          <GlobalDataTable
            stickyHeader
            toolbarLeading={
              <span className="text-sm font-medium">Branch revenue targets</span>
            }
            empty={targets.length === 0}
            emptyMessage="No branch revenue targets for this period."
            toolbarActions={
              targetSelection.selectedCount > 0 ? (
                <Button variant="secondary" size="sm" onClick={targetSelection.clearSelection}>
                  {targetSelection.selectedCount} selected
                </Button>
              ) : null
            }
          >
                <TableHeader>
                  <TableRow>
                    <GlobalTableHead className="w-10">
                      <Checkbox
                        checked={targetSelection.isAllSelected || (targetSelection.isPartiallySelected ? "indeterminate" : false)}
                        onCheckedChange={(checked) => targetSelection.toggleAll(checked === true)}
                        aria-label="Select all revenue targets"
                      />
                    </GlobalTableHead>
                    <GlobalTableHead className="w-12">#</GlobalTableHead>
                    <GlobalTableHead>Branch</GlobalTableHead>
                    <GlobalTableHead>SAP</GlobalTableHead>
                    <GlobalTableHead className="text-right">Target</GlobalTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {targets.map((t, index) => (
                    <TableRow key={t.id} data-state={targetSelection.isRowSelected(t.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={targetSelection.isRowSelected(t.id)}
                          onCheckedChange={(checked) => targetSelection.toggleRow(t.id, checked === true)}
                          aria-label={`Select target for ${t.branch.name}`}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium">{t.branch.name}</TableCell>
                      <TableCell className="font-mono text-sm">{t.branch.sapCode}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.revenueLabel}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
          </GlobalDataTable>

          <AllocationGapsTable
            basePath="/settings/planning"
            result={gapsResult}
            branches={branches}
            currentBranch={currentBranch}
            currentQ={currentQ}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No active planning period. Upload the BRS Planogram &amp; Forecast CSV
          to begin.
        </p>
      )}
    </div>
  );
}