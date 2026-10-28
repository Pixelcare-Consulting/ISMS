"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { TransferRequestDialog } from "@/app/(app)/logistics/_components/transfer-request-dialog";
import { createTransferAction } from "@/features/logistics/actions/logistics.actions";
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
  LOGISTICS_TRANSFERS_PATH,
} from "@/app/(app)/logistics/_components/logistics-paths";
import { CompactProgressRail } from "@/app/(app)/logistics/_components/compact-progress-rail";
import { buildTransferTracker } from "@/app/(app)/logistics/_components/transfer-tracker";
import type { WorkflowStatusOption } from "@/features/logistics/constants/workflow-codes";
import {
  LogisticsListViewSwitch,
  useLogisticsListProgressView,
} from "@/app/(app)/logistics/_components/logistics-list-view-switch";
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

interface TransferRow {
  id: string;
  transferNo: string;
  statusCode: StatusCodeRef;
  fromBranch: { id: string; name: string };
  toBranch: { id: string; name: string };
  lines: { serialNumberId: string }[];
}

interface TransfersPanelProps {
  transfers: PaginatedList<TransferRow>;
  capabilities: LogisticsActionCapabilities;
  branchScope: string[] | null;
  currentUserName: string;
  workflowStatuses: readonly WorkflowStatusOption[];
  initialSort?: string;
  initialSortDir?: string;
}

const transferColumn = createColumnHelper<DataTableFeatures, TransferRow>();

type TransferSortField = "transferNo" | "fromBranch" | "toBranch" | "status";
type TransferSortDir = "asc" | "desc";

export function TransfersPanel({
  transfers,
  capabilities,
  branchScope,
  currentUserName,
  workflowStatuses,
  initialSort = "",
  initialSortDir = "desc",
}: TransfersPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [progressView] = useLogisticsListProgressView();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const pageSize = parseTablePageSize(transfers.limit);
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as TransferSortDir;

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(
      buildLogisticsPageHref(LOGISTICS_TRANSFERS_PATH, 1, limit, sort, sort ? sortDir : undefined),
    );
  }

  function toggleSort(field: TransferSortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(
      buildLogisticsPageHref(LOGISTICS_TRANSFERS_PATH, 1, pageSize, next.sort, next.dir),
    );
  }

  const filtered = useMemo(
    () =>
      transfers.items.filter((t) =>
        matchesTableSearch(query, [
          t.transferNo,
          t.fromBranch.name,
          t.toBranch.name,
          t.statusCode.name,
          t.statusCode.code,
        ]),
      ),
    [transfers.items, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        transfers.items.map((t) => t.transferNo),
        transfers.items.map((t) => t.fromBranch.name),
        transfers.items.map((t) => t.toBranch.name),
        transfers.items.map((t) => t.statusCode.name),
        transfers.items.map((t) => t.statusCode.code),
      ),
    [transfers.items],
  );


  const indexOffset = (transfers.page - 1) * transfers.limit;
  const columns = useMemo(() => {
    const cols: DataTableColumn<TransferRow>[] = [
      transferColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "text-center tabular-nums text-muted-foreground" },
      }),
      transferColumn.accessor((row) => row.transferNo, {
        id: "transferNo",
        header: "No.",
        enableSorting: true,
        cell: ({ row }) => (
          <Link
            href={`/logistics/transfers/${row.original.id}`}
            className="font-medium hover:underline"
          >
            {row.original.transferNo}
          </Link>
        ),
      }),
      transferColumn.display({
        id: "progress",
        header: "Progress",
        enableSorting: false,
        cell: ({ row }) => (
          <CompactProgressRail
            ariaLabel={`${row.original.transferNo} progress`}
            items={buildTransferTracker(
              {
                code: row.original.statusCode.code,
                name: row.original.statusCode.name,
                color: row.original.statusCode.color ?? null,
              },
              [],
              workflowStatuses,
            )}
          />
        ),
        meta: { className: "w-52 min-w-52" },
      }),
      transferColumn.display({
        id: "fromBranch",
        header: "From → To",
        enableSorting: true,
        cell: ({ row }) =>
          `${row.original.fromBranch.name} → ${row.original.toBranch.name}`,
      }),
      transferColumn.display({
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
      transferColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/logistics/transfers/${row.original.id}`}>Open</Link>
          </Button>
        ),
      }),
    ];
    if (!progressView) return cols.filter((column) => column.id !== "progress");
    const progressIds = new Set(["transferNo", "progress", "fromBranch", "status", "actions"]);
    return cols.filter((column) => column.id != null && progressIds.has(column.id));
  }, [indexOffset, progressView, workflowStatuses]);

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
          onSort: (columnId) => toggleSort(columnId as TransferSortField),
        }}
        stickyHeader
        search={{ value: query, onChange: setQuery, placeholder: "Search transfers…", suggestions }}
        toolbarActions={
          <>
          <LogisticsListViewSwitch />
          {capabilities.canCreate ? (
            <Button
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setCreateOpen(true)}
            >
              New transfer request
            </Button>
          ) : null}
          </>
        }
        pagination={{
          total: transfers.total,
          page: transfers.page,
          totalPages: transfers.totalPages,
          itemLabel: "transfer",
          buildHref: (page) =>
            buildLogisticsPageHref(
              LOGISTICS_TRANSFERS_PATH,
              page,
              pageSize,
              sort,
              sort ? sortDir : undefined,
            ),
        }}
        pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
        empty={filtered.length === 0}
        emptyMessage={query.trim() ? "No results match your search." : "No transfers."}
      />

      <TransferRequestDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={createTransferAction}
        onCreated={() => router.refresh()}
        onUpdated={() => router.refresh()}
        currentUserName={currentUserName}
        capabilities={capabilities}
        branchScope={branchScope}
      />
    </>
  );
}
