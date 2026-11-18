"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ScServiceReturnDrawer } from "@/app/(app)/service-centers/returns/_components/sc-service-return-drawer";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { Button } from "@/components/ui/button";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import type {
  listScServiceReturnsAction,
  ScServiceReturnListItem,
} from "@/features/service-center-ops/actions/sc-service-returns.actions";
import {
  SC_SERVICE_RETURN_FILTER_LABELS,
  SC_SERVICE_RETURN_STATUS_META,
  scServiceActionLabel,
  scServiceReturnsHref,
} from "@/features/service-center-ops/constants/sc-service-returns";
import { DataTable, type DataTableColumn, type DataTableFeatures } from "@/lib/data-table";
import { GlobalKpiCards, type KpiCardItem } from "@/lib/kpi-cards";

type ListResult = Awaited<ReturnType<typeof listScServiceReturnsAction>>;

const column = createColumnHelper<DataTableFeatures, ScServiceReturnListItem>();

const SEARCH_DEBOUNCE_MS = 350;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export function ScServiceReturnsPanel({
  result,
  initialQuery,
  initialRequestId,
}: {
  result: ListResult;
  initialQuery: string;
  initialRequestId: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [openRequestId, setOpenRequestId] = useState<string | null>(initialRequestId);
  const pageSize = parseTablePageSize(result.limit);
  const filter = result.filter;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  function hrefFor(overrides: { status?: string; q?: string; page?: number; limit?: number }) {
    return scServiceReturnsHref({
      status: overrides.status ?? filter,
      q: overrides.q ?? query,
      page: overrides.page ?? 1,
      limit: overrides.limit ?? (pageSize === DEFAULT_TABLE_PAGE_SIZE ? undefined : pageSize),
    });
  }

  function handleSearch(value: string) {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      router.replace(hrefFor({ q: value, page: 1 }));
    }, SEARCH_DEBOUNCE_MS);
  }

  function closeDrawer() {
    setOpenRequestId(null);
    if (initialRequestId) router.replace(hrefFor({ page: result.page }));
  }

  const kpis: KpiCardItem[] = [
    {
      key: "open",
      label: SC_SERVICE_RETURN_FILTER_LABELS.open,
      value: result.open.pendingSc + result.open.awaitingStock,
      href: hrefFor({ status: "open" }),
      selected: filter === "open",
    },
    {
      key: "pending_sc",
      label: SC_SERVICE_RETURN_FILTER_LABELS.pending_sc,
      value: result.open.pendingSc,
      href: hrefFor({ status: "pending_sc" }),
      selected: filter === "pending_sc",
    },
    {
      key: "awaiting_stock",
      label: SC_SERVICE_RETURN_FILTER_LABELS.awaiting_stock,
      value: result.open.awaitingStock,
      href: hrefFor({ status: "awaiting_stock" }),
      selected: filter === "awaiting_stock",
    },
  ];

  const historyFilters = ["completed", "rejected", "all"] as const;

  const columns = useMemo(() => {
    const cols: DataTableColumn<ScServiceReturnListItem>[] = [
      column.display({
        id: "status",
        header: "STATUS",
        cell: ({ row }) => {
          const meta = SC_SERVICE_RETURN_STATUS_META[row.original.status];
          return <StatusCodeBadge code={row.original.status} name={meta.label} color={meta.color} />;
        },
      }),
      column.display({
        id: "type",
        header: "TYPE",
        cell: ({ row }) => scServiceActionLabel(row.original.actionType),
      }),
      column.display({
        id: "transactionNo",
        header: "SI / TRN",
        cell: ({ row }) => row.original.transactionNo,
        meta: { className: "font-mono font-semibold" },
      }),
      column.display({
        id: "serial",
        header: "RETURNED SN",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-mono">{row.original.serialNo ?? "—"}</p>
            {row.original.modelLabel ? (
              <p className="truncate text-xs text-muted-foreground">{row.original.modelLabel}</p>
            ) : null}
          </div>
        ),
      }),
      column.display({
        id: "customer",
        header: "CUSTOMER",
        cell: ({ row }) => row.original.customerName?.trim() || "—",
      }),
      column.display({
        id: "serviceCenter",
        header: "SERVICE CENTER",
        cell: ({ row }) => row.original.serviceCenterName,
      }),
      column.display({
        id: "stock",
        header: "RETURN AS",
        cell: ({ row }) => row.original.stockStatusCode,
      }),
      column.display({
        id: "createdAt",
        header: "REQUESTED",
        cell: ({ row }) => formatDate(row.original.createdAt),
        meta: { className: "tabular-nums" },
      }),
      column.display({
        id: "actions",
        header: "ACTIONS",
        enableHiding: false,
        cell: ({ row }) => (
          <Button size="sm" variant="outline" onClick={() => setOpenRequestId(row.original.id)}>
            {row.original.status === "pending_sc" ? "Inspect" : "View"}
          </Button>
        ),
      }),
    ];
    return cols;
  }, []);

  return (
    <div className="space-y-4">
      <GlobalKpiCards items={kpis} />

      <nav aria-label="Finished requests" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">History:</span>
        {historyFilters.map((value) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? "secondary" : "ghost"}
            onClick={() => router.push(hrefFor({ status: value }))}
            aria-current={filter === value ? "page" : undefined}
          >
            {SC_SERVICE_RETURN_FILTER_LABELS[value]}
          </Button>
        ))}
      </nav>

      <DataTable
        data={result.items}
        columns={columns}
        getRowId={(row) => row.id}
        manualPagination
        stickyHeader
        search={{
          value: query,
          onChange: handleSearch,
          placeholder: "Search SI, serial or customer…",
        }}
        pagination={{
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          itemLabel: "request",
          buildHref: (page) => hrefFor({ page }),
        }}
        pageSize={{
          value: pageSize,
          onChange: (limit: TablePageSize) => router.push(hrefFor({ page: 1, limit })),
        }}
        empty={result.items.length === 0}
        emptyMessage={
          query.trim()
            ? "No requests match your search."
            : filter === "open" || filter === "pending_sc" || filter === "awaiting_stock"
              ? "No service returns are waiting for your service centers."
              : "No finished service returns yet."
        }
      />

      <ScServiceReturnDrawer
        returnRequestId={openRequestId}
        onClose={closeDrawer}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}
