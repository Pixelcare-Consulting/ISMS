"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  processSapQueueAction,
  syncInventoryFromSapAction,
} from "@/features/sap/actions/sap.actions";
import {
  SAP_JOB_STATUS_LABELS,
  SAP_JOB_TYPE_LABELS,
} from "@/features/sap/constants/sap-job-types";
import {
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { TablePagination } from "@/components/data-table/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SapIntegrationJobStatus, SapIntegrationJobType } from "@prisma/client";

interface SapJobRow {
  id: string;
  jobType: SapIntegrationJobType;
  status: SapIntegrationJobStatus;
  idempotencyKey: string;
  referenceType: string | null;
  referenceId: string | null;
  sapDocRef: string | null;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: Date;
  processedAt: Date | null;
}

interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface SapIntegrationPanelProps {
  jobs: PaginatedList<SapJobRow>;
}

export function SapIntegrationPanel({ jobs }: SapIntegrationPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const selection = useTableSelection(jobs.items.map((job) => job.id));

  function runQueue() {
    startTransition(async () => {
      const result = await processSapQueueAction();
      const completed = result.results.filter(
        (r: { status: string }) => r.status === "completed",
      ).length;
      toast.success(`Processed ${result.results.length} job(s) — ${completed} completed`);
      router.refresh();
    });
  }

  function runInventorySync() {
    startTransition(async () => {
      await syncInventoryFromSapAction({});
      toast.success("Inventory sync job queued");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={pending} onClick={runInventorySync}>
          Queue inventory sync (stub)
        </Button>
        <Button disabled={pending} onClick={runQueue}>
          Process pending jobs
        </Button>
      </div>

      <DataTableShell>
        {selection.selectedCount > 0 ? (
          <div className="px-4 pb-2">
            <Button variant="secondary" size="sm" onClick={selection.clearSelection}>
              {selection.selectedCount} selected
            </Button>
          </div>
        ) : null}
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                    aria-label="Select all SAP jobs"
                  />
                </TableHead>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>SAP doc</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground text-center">
                    No integration jobs yet. Approve an order to enqueue an approved_order job.
                  </TableCell>
                </TableRow>
              ) : (
                jobs.items.map((job, index) => (
                  <TableRow key={job.id} data-state={selection.isRowSelected(job.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selection.isRowSelected(job.id)}
                        onCheckedChange={(checked) => selection.toggleRow(job.id, checked === true)}
                        aria-label={`Select SAP job ${job.id.slice(-8)}`}
                      />
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="text-sm">
                      {SAP_JOB_TYPE_LABELS[job.jobType]}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{SAP_JOB_STATUS_LABELS[job.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {job.referenceType ?? "—"}
                      {job.referenceId ? ` / ${job.referenceId.slice(-8)}` : ""}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{job.sapDocRef ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {job.attemptCount}/{job.maxAttempts}
                    </TableCell>
                    <TableCell className="text-destructive max-w-[200px] truncate text-xs">
                      {job.lastError ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </DataTableScroll>
        <TablePagination
          page={jobs.page}
          totalPages={jobs.totalPages}
          buildHref={(page) => `/settings/sap-integration?page=${page}`}
        />
      </DataTableShell>
    </div>
  );
}
