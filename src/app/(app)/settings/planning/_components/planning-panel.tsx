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

import { AppDataTable, AppDataTableBody } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
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
        <StatCard label="Active period" value={period?.label ?? "None"} />

        <StatCard label="Allocation gaps" value={String(gapCount)} />

        <StatCard label="Draft suggestions" value={String(draftOrders)} />

        <StatCard
          label="Allocation rows"
          value={String(period?._count?.allocations ?? 0)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
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
          variant="outline"
          disabled={pending}
          onClick={() => fileRef.current?.click()}
        >
          Upload forecast CSV
        </Button>

        {period ? (
          <>
            <Button
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
              variant="secondary"
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
              variant="outline"
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

        <Button variant="link" asChild>
          <Link href="/planning/suggested-orders">View suggested orders →</Link>
        </Button>
      </div>

      {period ? (
        <>
          <AppDataTable
            title="Branch revenue targets"
            empty={targets.length === 0}
            emptyMessage="No branch revenue targets for this period."
          >
            <AppDataTableBody>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead>SAP</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {targets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.branch.name}</TableCell>
                      <TableCell className="font-mono text-sm">{t.branch.sapCode}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.revenueLabel}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AppDataTableBody>
          </AppDataTable>

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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>

      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
