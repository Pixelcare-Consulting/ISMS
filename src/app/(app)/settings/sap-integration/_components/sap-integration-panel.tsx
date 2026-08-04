"use client";

import { useRouter, useSearchParams } from "next/navigation";
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
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { GlobalDataTable, GlobalTableHead, nextTableSort } from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TableBody,
  TableCell,
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

type SapJobSortField =
  | "jobType"
  | "status"
  | "referenceId"
  | "sapDocNum"
  | "attempts"
  | "createdAt";
type SapJobSortDir = "asc" | "desc";

interface SapIntegrationPanelProps {
  jobs: PaginatedList<SapJobRow>;
  initialSort?: string;
  initialSortDir?: string;
}

function buildSapJobsHref(page: number, sort?: string, sortDir?: string): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (sort) params.set("sort", sort);
  if (sort && sortDir) params.set("dir", sortDir);
  const query = params.toString();
  return query ? `/settings/sap-integration?${query}` : "/settings/sap-integration";
}

export function SapIntegrationPanel({
  jobs,
  initialSort = "",
  initialSortDir = "desc",
}: SapIntegrationPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const selection = useTableSelection(jobs.items.map((job) => job.id));
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as SapJobSortDir;

  function toggleSort(field: SapJobSortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(buildSapJobsHref(1, next.sort, next.dir));
  }

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

      <GlobalDataTable
        stickyHeader
        toolbarActions={
          selection.selectedCount > 0 ? (
            <Button variant="secondary" size="sm" onClick={selection.clearSelection}>
              {selection.selectedCount} selected
            </Button>
          ) : null
        }
        pagination={{
          total: jobs.total,
          page: jobs.page,
          totalPages: jobs.totalPages,
          itemLabel: "job",
          buildHref: (page) => buildSapJobsHref(page, sort || undefined, sort ? sortDir : undefined),
        }}
      >
            <TableHeader>
              <TableRow>
                <GlobalTableHead className="w-10">
                  <Checkbox
                    checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                    aria-label="Select all SAP jobs"
                  />
                </GlobalTableHead>
                <GlobalTableHead className="w-12">#</GlobalTableHead>
                <GlobalTableHead
                  sortKey="jobType"
                  activeSortKey={sort}
                  sortDirection={sortDir}
                  onSort={(key) => toggleSort(key as SapJobSortField)}
                >
                  Type
                </GlobalTableHead>
                <GlobalTableHead
                  sortKey="status"
                  activeSortKey={sort}
                  sortDirection={sortDir}
                  onSort={(key) => toggleSort(key as SapJobSortField)}
                >
                  Status
                </GlobalTableHead>
                <GlobalTableHead
                  sortKey="referenceId"
                  activeSortKey={sort}
                  sortDirection={sortDir}
                  onSort={(key) => toggleSort(key as SapJobSortField)}
                >
                  Reference
                </GlobalTableHead>
                <GlobalTableHead
                  sortKey="sapDocNum"
                  activeSortKey={sort}
                  sortDirection={sortDir}
                  onSort={(key) => toggleSort(key as SapJobSortField)}
                >
                  SAP doc
                </GlobalTableHead>
                <GlobalTableHead
                  sortKey="attempts"
                  activeSortKey={sort}
                  sortDirection={sortDir}
                  onSort={(key) => toggleSort(key as SapJobSortField)}
                >
                  Attempts
                </GlobalTableHead>
                <GlobalTableHead>Error</GlobalTableHead>
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
      </GlobalDataTable>
    </div>
  );
}
