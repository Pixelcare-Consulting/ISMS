"use client";

import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { PulloutRequestDialog } from "@/app/(app)/logistics/_components/pullout-request-dialog";
import {
  approvePulloutTlAction,
  createPulloutAction,
  rejectPulloutAction,
} from "@/features/logistics/actions/logistics.actions";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import {
  DataTable,
  nextTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import {
  buildLogisticsPageHref,
  LOGISTICS_PICKUPS_PATH,
} from "@/app/(app)/logistics/_components/logistics-paths";
import { matchesTableSearch } from "@/utils/match-table-search";

interface StatusCodeRef {
  id: string;
  code: string;
  name: string;
  color?: string | null;
}

interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface PulloutRow {
  id: string;
  pulloutNo: string;
  statusCode: StatusCodeRef;
  reasonStatusCode: StatusCodeRef | null;
  branch: { name: string };
  warehouse: { name: string; code: string };
}

interface PulloutsPanelProps {
  pullouts: PaginatedList<PulloutRow>;
  capabilities: LogisticsActionCapabilities;
  currentUserName?: string;
  initialSort?: string;
  initialSortDir?: string;
}

const pulloutColumn = createColumnHelper<DataTableFeatures, PulloutRow>();

type PulloutSortField = "pulloutNo" | "branch" | "warehouse" | "reason" | "status";
type PulloutSortDir = "asc" | "desc";

export function PulloutsPanel({
  pullouts,
  capabilities,
  currentUserName = "",
  initialSort = "",
  initialSortDir = "desc",
}: PulloutsPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const pageSize = parseTablePageSize(pullouts.limit);
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as PulloutSortDir;

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(
      buildLogisticsPageHref(LOGISTICS_PICKUPS_PATH, 1, limit, sort, sort ? sortDir : undefined),
    );
  }

  function toggleSort(field: PulloutSortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(buildLogisticsPageHref(LOGISTICS_PICKUPS_PATH, 1, pageSize, next.sort, next.dir));
  }

  const filtered = useMemo(
    () =>
      pullouts.items.filter((p) =>
        matchesTableSearch(query, [
          p.pulloutNo,
          p.branch.name,
          p.warehouse.name,
          p.warehouse.code,
          p.reasonStatusCode?.name,
          p.reasonStatusCode?.code,
          p.statusCode.name,
          p.statusCode.code,
        ]),
      ),
    [pullouts.items, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        pullouts.items.map((p) => p.pulloutNo),
        pullouts.items.map((p) => p.branch.name),
        pullouts.items.map((p) => p.warehouse.name),
        pullouts.items.map((p) => p.warehouse.code),
        pullouts.items.map((p) => p.reasonStatusCode?.name),
        pullouts.items.map((p) => p.reasonStatusCode?.code),
        pullouts.items.map((p) => p.statusCode.name),
        pullouts.items.map((p) => p.statusCode.code),
      ),
    [pullouts.items],
  );

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const selectedCount = filtered.filter((row) => rowSelection[row.id]).length;

  function runAction(
    action: () => Promise<{ error: string } | { success: true }>,
    message: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(message);
      router.refresh();
    });
  }

  const indexOffset = (pullouts.page - 1) * pullouts.limit;
  const columns = useMemo(() => {
    const cols: DataTableColumn<PulloutRow>[] = [
      pulloutColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "text-center tabular-nums text-muted-foreground" },
      }),
      pulloutColumn.accessor((row) => row.pulloutNo, {
        id: "pulloutNo",
        header: "No.",
        enableSorting: true,
        cell: ({ row }) => (
          <Link
            href={`/logistics/pickups/${row.original.id}`}
            className="font-medium hover:underline"
          >
            {row.original.pulloutNo}
          </Link>
        ),
      }),
      pulloutColumn.accessor((row) => row.branch.name, {
        id: "branch",
        header: "Branch",
        enableSorting: true,
      }),
      pulloutColumn.accessor((row) => row.warehouse.name, {
        id: "warehouse",
        header: "Warehouse",
        enableSorting: true,
      }),
      pulloutColumn.display({
        id: "reason",
        header: "Reason",
        enableSorting: true,
        cell: ({ row }) =>
          row.original.reasonStatusCode ? (
            <StatusCodeBadge
              code={row.original.reasonStatusCode.code}
              name={row.original.reasonStatusCode.name}
              color={row.original.reasonStatusCode.color}
            />
          ) : (
            "—"
          ),
      }),
      pulloutColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <StatusCodeBadge
            code={row.original.statusCode.code}
            name={row.original.statusCode.name}
            color={row.original.statusCode.color}
          />
        ),
      }),
      pulloutColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const pullout = row.original;
          return (
            <div className="flex flex-wrap gap-2">
              {pullout.statusCode.code === "pending_tl" && capabilities.canApproveTl ? (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    runAction(() => approvePulloutTlAction(pullout.id), "Pull-out approved")
                  }
                >
                  Approve
                </Button>
              ) : null}
              {pullout.statusCode.code === "pending_tl" && capabilities.canRejectTransfer ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    runAction(() => rejectPulloutAction(pullout.id), "Pull-out rejected")
                  }
                >
                  Reject
                </Button>
              ) : null}
              <Button size="sm" variant="outline" asChild>
                <Link href={`/logistics/pickups/${pullout.id}`}>Open</Link>
              </Button>
            </div>
          );
        },
      }),
    ];
    return cols;
  }, [capabilities.canApproveTl, capabilities.canRejectTransfer, indexOffset, pending]);

  return (
    <>
    <DataTable
      data={filtered}
      columns={columns}
      getRowId={(row) => row.id}
      manualSorting
      manualPagination
      enableSorting
      sorting={{
        sortKey: sort,
        sortDir,
        onSort: (columnId) => toggleSort(columnId as PulloutSortField),
      }}
      enableRowSelection
      rowSelection={rowSelection}
      onRowSelectionChange={setRowSelection}
      selectAllLabel="Select all pull-outs"
      getSelectionLabel={(row) => `Select pull-out ${row.pulloutNo}`}
      stickyHeader
      search={{ value: query, onChange: setQuery, placeholder: "Search pull-outs…", suggestions }}
      toolbarActions={
        <>
          {selectedCount > 0 ? (
            <Button variant="secondary" onClick={() => setRowSelection({})}>
              {selectedCount} selected
            </Button>
          ) : null}
        {capabilities.canCreate ? (
          <Button
            size="sm"
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={() => setCreateOpen(true)}
          >
            New pull-out
          </Button>
        ) : null}
        </>
      }
      pagination={{
        total: pullouts.total,
        page: pullouts.page,
        totalPages: pullouts.totalPages,
        itemLabel: "pull-out",
        buildHref: (page) =>
          buildLogisticsPageHref(
            LOGISTICS_PICKUPS_PATH,
            page,
            pageSize,
            sort,
            sort ? sortDir : undefined,
          ),
      }}
      pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
      empty={filtered.length === 0}
      emptyMessage={query.trim() ? "No results match your search." : "No pull-outs."}
    />
    <PulloutRequestDialog
      open={createOpen}
      onOpenChange={setCreateOpen}
      onSubmit={createPulloutAction}
      onCreated={() => router.refresh()}
      currentUserName={currentUserName}
    />
    </>
  );
}
