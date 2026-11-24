"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { PulloutRequestDialog } from "@/app/(app)/logistics/_components/pullout-request-dialog";
import { usePulloutSource } from "@/app/(app)/logistics/_components/pullout-source";
import type { PulloutActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
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
import { buildLogisticsPageHref } from "@/app/(app)/logistics/_components/logistics-paths";
import { CompactProgressRail } from "@/app/(app)/logistics/_components/compact-progress-rail";
import { buildPulloutTracker } from "@/app/(app)/logistics/_components/pullout-tracker";
import type { WorkflowStatusOption } from "@/features/logistics/constants/workflow-codes";
import {
  LogisticsListViewSwitch,
  useLogisticsListProgressView,
} from "@/app/(app)/logistics/_components/logistics-list-view-switch";

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

export interface PulloutListRow {
  id: string;
  pulloutNo: string;
  statusCode: StatusCodeRef;
  reasonStatusCode: StatusCodeRef | null;
  /** The branch, or the service center on an SC pull-out. */
  place: { name: string };
}

type PulloutRow = PulloutListRow;

interface PulloutsPanelProps {
  pullouts: PaginatedList<PulloutRow>;
  capabilities: PulloutActionCapabilities;
  workflowStatuses: readonly WorkflowStatusOption[];
  currentUserName?: string;
  initialSort?: string;
  initialSortDir?: string;
  /** Search term from the URL. The server filters on it, serial numbers included. */
  initialQuery?: string;
}

const SEARCH_DEBOUNCE_MS = 350;

const pulloutColumn = createColumnHelper<DataTableFeatures, PulloutRow>();

type PulloutSortDir = "asc" | "desc";

export function PulloutsPanel({
  pullouts,
  capabilities,
  workflowStatuses,
  currentUserName = "",
  initialSort = "",
  initialSortDir = "desc",
  initialQuery = "",
}: PulloutsPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { listHref, detailHref, copy } = usePulloutSource();
  const [progressView] = useLogisticsListProgressView();
  const [query, setQuery] = useState(initialQuery);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const pageSize = parseTablePageSize(pullouts.limit);
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as PulloutSortDir;

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(
      buildLogisticsPageHref(listHref, 1, limit, sort, sort ? sortDir : undefined, query),
    );
  }

  function toggleSort(field: string) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(buildLogisticsPageHref(listHref, 1, pageSize, next.sort, next.dir, query));
  }

  /** Searches every page on the server, so a serial number finds the pull-out it is on. */
  function handleSearch(value: string) {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      router.replace(
        buildLogisticsPageHref(listHref, 1, pageSize, sort, sort ? sortDir : undefined, value),
      );
    }, SEARCH_DEBOUNCE_MS);
  }

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        pullouts.items.map((p) => p.pulloutNo),
        pullouts.items.map((p) => p.place.name),
        pullouts.items.map((p) => p.reasonStatusCode?.name),
        pullouts.items.map((p) => p.reasonStatusCode?.code),
        pullouts.items.map((p) => p.statusCode.name),
        pullouts.items.map((p) => p.statusCode.code),
      ),
    [pullouts.items],
  );


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
            href={detailHref(row.original.id)}
            className="font-medium hover:underline"
          >
            {row.original.pulloutNo}
          </Link>
        ),
      }),
      pulloutColumn.display({
        id: "progress",
        header: "Progress",
        enableSorting: false,
        cell: ({ row }) => (
          <CompactProgressRail
            ariaLabel={`${row.original.pulloutNo} progress`}
            items={buildPulloutTracker(
              {
                code: row.original.statusCode.code,
                name: row.original.statusCode.name,
                color: row.original.statusCode.color ?? null,
              },
              "",
              [],
              workflowStatuses,
            )}
          />
        ),
        meta: { className: "w-52 min-w-52" },
      }),
      pulloutColumn.accessor((row) => row.place.name, {
        id: copy.placeSortKey,
        header: copy.placeColumn,
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
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href={detailHref(row.original.id)}>Open</Link>
            </Button>
          </div>
        ),
      }),
    ];
    if (!progressView) return cols.filter((column) => column.id !== "progress");
    const progressIds = new Set([
      "pulloutNo",
      "progress",
      copy.placeSortKey,
      "reason",
      "status",
      "actions",
    ]);
    return cols.filter((column) => column.id != null && progressIds.has(column.id));
  }, [copy, detailHref, indexOffset, progressView, workflowStatuses]);

  return (
    <>
    <DataTable
      data={pullouts.items}
      columns={columns}
      getRowId={(row) => row.id}
      manualSorting
      manualPagination
      enableSorting
      sorting={{
        sortKey: sort,
        sortDir,
        onSort: (columnId) => toggleSort(columnId),
      }}
      stickyHeader
      search={{
        value: query,
        onChange: handleSearch,
        placeholder: "Search pull-out, serial no., status…",
        suggestions,
      }}
      toolbarActions={
        <>
        <LogisticsListViewSwitch />
        {capabilities.canCreate ? (
          <Button
            size="sm"
            className="w-full sm:w-auto"
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
            listHref,
            page,
            pageSize,
            sort,
            sort ? sortDir : undefined,
            query,
          ),
      }}
      pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
      empty={pullouts.items.length === 0}
      emptyMessage={query.trim() ? "No results match your search." : "No pull-outs."}
    />
    <PulloutRequestDialog
      open={createOpen}
      onOpenChange={setCreateOpen}
      onCreated={() => router.refresh()}
      currentUserName={currentUserName}
    />
    </>
  );
}
