"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";
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
  DataTable,
  nextTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const sapColumn = createColumnHelper<DataTableFeatures, SapJobRow>();
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
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const selectedCount = jobs.items.filter((job) => rowSelection[job.id]).length;
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

  const columns = useMemo(() => {
    const cols: DataTableColumn<SapJobRow>[] = [
      sapColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      sapColumn.display({
        id: "jobType",
        header: "Type",
        enableSorting: true,
        cell: ({ row }) => SAP_JOB_TYPE_LABELS[row.original.jobType],
        meta: { className: "text-sm" },
      }),
      sapColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant="outline">{SAP_JOB_STATUS_LABELS[row.original.status]}</Badge>
        ),
      }),
      sapColumn.display({
        id: "referenceId",
        header: "Reference",
        enableSorting: true,
        cell: ({ row }) =>
          `${row.original.referenceType ?? "—"}${
            row.original.referenceId ? ` / ${row.original.referenceId.slice(-8)}` : ""
          }`,
        meta: { className: "text-xs text-muted-foreground" },
      }),
      sapColumn.display({
        id: "sapDocNum",
        header: "SAP doc",
        enableSorting: true,
        cell: ({ row }) => row.original.sapDocRef ?? "—",
        meta: { className: "font-mono text-xs" },
      }),
      sapColumn.display({
        id: "attempts",
        header: "Attempts",
        enableSorting: true,
        cell: ({ row }) => `${row.original.attemptCount}/${row.original.maxAttempts}`,
        meta: { className: "text-sm" },
      }),
      sapColumn.display({
        id: "error",
        header: "Error",
        enableSorting: false,
        cell: ({ row }) => row.original.lastError ?? "—",
        meta: {
          className: "max-w-[200px] truncate text-xs text-destructive",
        },
      }),
    ];
    return cols;
  }, []);

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

      <DataTable
        data={jobs.items}
        columns={columns}
        getRowId={(row) => row.id}
        manualSorting
        manualPagination
        enableSorting
        sorting={{
          sortKey: sort,
          sortDir,
          onSort: (columnId) => toggleSort(columnId as SapJobSortField),
        }}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        selectAllLabel="Select all SAP jobs"
        getSelectionLabel={(row) => `Select SAP job ${row.id.slice(-8)}`}
        stickyHeader
        toolbarActions={
          selectedCount > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => setRowSelection({})}>
              {selectedCount} selected
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
        empty={jobs.items.length === 0}
        emptyMessage="No integration jobs yet. Approve an order to enqueue an approved_order job."
      />
    </div>
  );
}
