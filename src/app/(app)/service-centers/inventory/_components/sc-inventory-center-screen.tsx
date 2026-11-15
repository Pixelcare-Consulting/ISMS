"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { V2StatStrip } from "@/app/(app)/inventory/v2/_components/v2-stat-strip";
import { V2TealLink } from "@/app/(app)/inventory/v2/_components/v2-teal-link";
import { ScInventoryUnitDrawer } from "@/app/(app)/service-centers/inventory/_components/sc-inventory-unit-drawer";
import { scInventoryHref } from "@/app/(app)/service-centers/inventory/links";
import type { TablePageSize } from "@/components/data-table/table-page-size";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import type {
  ScInventoryOverviewDto,
  ScInventoryUnitDto,
} from "@/features/service-center-ops/actions/sc-inventory.actions";
import { DataTable, type DataTableColumn, type DataTableFeatures } from "@/lib/data-table";
import type { PaginatedResult } from "@/lib/shared/pagination";

interface ScInventoryCenterScreenProps {
  center: ScInventoryOverviewDto["centers"][number];
  result: PaginatedResult<ScInventoryUnitDto>;
  statuses: ScInventoryOverviewDto["statuses"];
  statusAmounts: ScInventoryOverviewDto["statusAmounts"];
  statusOptions: ScInventoryOverviewDto["statusOptions"];
  /** Every model at this center, not just the current page. */
  modelOptions: ScInventoryOverviewDto["modelOptions"];
  q: string;
  statusCodeId?: string;
  sku?: string;
  locationId?: string;
  /** Series chosen on the center list. */
  seriesId?: string;
  limit: number;
  seriesSummary?: ReactNode;
}

type Filters = { q?: string; statusCodeId?: string; sku?: string; locationId?: string; page?: number; limit?: number };

const unitColumn = createColumnHelper<DataTableFeatures, ScInventoryUnitDto>();
const SEARCH_DEBOUNCE_MS = 300;
const ALL = "all";

function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value?: string;
  options: { value: string; label: string }[];
  onChange: (value?: string) => void;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? undefined : next)}>
      <SelectTrigger aria-label={label} className="w-[11rem]">
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ScInventoryCenterScreen({
  center,
  result,
  statuses,
  statusAmounts,
  statusOptions,
  modelOptions,
  q,
  statusCodeId,
  sku,
  locationId,
  seriesId,
  limit,
  seriesSummary,
}: ScInventoryCenterScreenProps) {
  const router = useRouter();
  const [query, setQuery] = useState(q);
  const urlQueryRef = useRef(q);
  const [openUnit, setOpenUnit] = useState<ScInventoryUnitDto | null>(null);
  const totalUnits = statuses.reduce((sum, status) => sum + status.count, 0);

  const hrefFor = useCallback(
    (next: Filters) =>
      scInventoryHref({
        centerId: center.id,
        q: next.q,
        statusCodeId: next.statusCodeId,
        sku: next.sku,
        locationId: next.locationId,
        page: next.page,
        limit: next.limit ?? limit,
        series: seriesId,
      }),
    [center.id, limit, seriesId],
  );

  const current: Filters = { q: query.trim(), statusCodeId, sku, locationId };
  function go(next: Partial<Filters>) {
    router.push(hrefFor({ ...current, page: 1, ...next }), { scroll: false });
  }

  // Keep the box in sync when the URL changes from elsewhere (back button, a link).
  useEffect(() => {
    const previous = urlQueryRef.current;
    urlQueryRef.current = q;
    setQuery((value) => (value.trim() === previous.trim() ? q : value));
  }, [q]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = query.trim();
      if (next === q) return;
      router.push(hrefFor({ q: next, statusCodeId, sku, locationId, page: 1 }), { scroll: false });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [hrefFor, locationId, q, query, router, sku, statusCodeId]);

  // A filtered value that has no units any more still shows, so the menu matches the URL.
  const statusMenu = useMemo(() => {
    const present = new Set(statuses.map((status) => status.code));
    return statusOptions
      .filter((option) => present.has(option.code) || option.id === statusCodeId)
      .map((option) => ({ value: option.id, label: option.name }));
  }, [statusCodeId, statusOptions, statuses]);
  const modelMenu = useMemo(() => {
    const options = modelOptions.map((model) => ({ value: model.sku, label: model.sku }));
    return sku && !options.some((option) => option.value === sku) ? [...options, { value: sku, label: sku }] : options;
  }, [modelOptions, sku]);
  const locationMenu = center.locations.map((location) => ({
    value: location.id,
    label: `${location.code} · ${location.name}`,
  }));

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        result.items.map((row) => row.serialNo),
        result.items.map((row) => row.model.sku),
        result.items.map((row) => row.model.name),
      ),
    [result.items],
  );

  const indexOffset = (result.page - 1) * result.limit;
  const columns = useMemo(
    (): DataTableColumn<ScInventoryUnitDto>[] => [
      unitColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { mobile: "detail", className: "w-0 whitespace-nowrap pl-4 pr-3 tabular-nums text-muted-foreground" },
      }),
      unitColumn.accessor((row) => row.serialNo, {
        id: "serial",
        header: "Serial no.",
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono font-medium">{row.original.serialNo}</span>,
        meta: { mobile: "primary" },
      }),
      unitColumn.accessor((row) => row.model.sku, {
        id: "model",
        header: "Model / product",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block font-mono font-medium">{row.original.model.sku}</span>
            <span className="block text-xs text-muted-foreground">{row.original.model.name}</span>
          </div>
        ),
        meta: { wrap: true, mobile: "primary", className: "min-w-0" },
      }),
      unitColumn.display({
        id: "location",
        header: "Location",
        enableSorting: false,
        cell: ({ row }) => row.original.location.code,
        meta: { mobile: "detail" },
      }),
      unitColumn.display({
        id: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => (
          <StatusCodeBadge
            code={row.original.status.code}
            name={row.original.status.name}
            color={row.original.status.color ?? undefined}
            codeOnly
          />
        ),
        meta: { mobile: "primary" },
      }),
      unitColumn.display({
        id: "dr",
        header: "DR no.",
        enableSorting: false,
        cell: ({ row }) => row.original.drNo ?? <span className="text-muted-foreground">—</span>,
        meta: { mobile: "detail", className: "tabular-nums" },
      }),
      unitColumn.display({
        id: "aging",
        header: "Aging",
        enableSorting: false,
        cell: ({ row }) => (row.original.agingDays === 1 ? "1 day" : `${row.original.agingDays} days`),
        meta: { align: "end", mobile: "detail", className: "tabular-nums" },
      }),
    ],
    [indexOffset],
  );

  const renderRowActions = useCallback(
    (row: ScInventoryUnitDto) => (
      <V2TealLink className="cursor-pointer" onClick={() => setOpenUnit(row)}>
        View unit details →
      </V2TealLink>
    ),
    [],
  );

  const filtered = Boolean(q || statusCodeId || sku || locationId);

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <V2TealLink href={scInventoryHref({ series: seriesId })}>← All service centers</V2TealLink>
        <h2 className="text-xl font-semibold tracking-tight">
          {center.name} · {center.sapCode}
        </h2>
        <p className="max-w-[65ch] text-sm text-muted-foreground">
          Every unit at this service center, with serial numbers visible. View only.
        </p>
      </header>

      <V2StatStrip
        statuses={statuses}
        totalUnits={totalUnits}
        statusAmounts={statusAmounts}
        showOffPlanogram={false}
      />

      {seriesSummary}

      <DataTable
        data={result.items}
        columns={columns}
        getRowId={(row) => row.id}
        manualPagination
        stickyHeader
        chrome="card"
        className="overflow-x-auto"
        tableClassName="min-w-[48rem]"
        renderRowActions={renderRowActions}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search serial number or model…",
          suggestions,
        }}
        pageSize={{ value: limit, onChange: (next: TablePageSize) => go({ limit: next }) }}
        toolbarActions={
          <>
            <FilterSelect
              label="Filter by status"
              allLabel="All statuses"
              value={statusCodeId}
              options={statusMenu}
              onChange={(value) => go({ statusCodeId: value })}
            />
            <FilterSelect
              label="Filter by model"
              allLabel="All models"
              value={sku}
              options={modelMenu}
              onChange={(value) => go({ sku: value })}
            />
            {locationMenu.length > 1 ? (
              <FilterSelect
                label="Filter by location"
                allLabel="All locations"
                value={locationId}
                options={locationMenu}
                onChange={(value) => go({ locationId: value })}
              />
            ) : null}
          </>
        }
        empty={result.items.length === 0}
        emptyMessage={
          filtered
            ? "No units match these filters."
            : seriesId
              ? "No units in this series at this service center."
              : "No units at this service center yet. Accepted deliveries show here."
        }
        pagination={{
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          itemLabel: "unit",
          buildHref: (page) => hrefFor({ q, statusCodeId, sku, locationId, page }),
        }}
      />

      <ScInventoryUnitDrawer
        unit={openUnit}
        onOpenChange={(open) => {
          if (!open) setOpenUnit(null);
        }}
      />
    </div>
  );
}
