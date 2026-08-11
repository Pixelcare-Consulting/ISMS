"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { WarehouseInventoryListItem } from "@/features/warehouse-inventory/actions/warehouse-inventory.actions";
import type {
  WarehouseFilterOption,
  WarehouseLocationFilterOption,
} from "@/features/warehouse-inventory/services/warehouse-inventory.service";
import { TableIndexCell, TableIndexHead } from "@/components/data-table";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { TableSearchBar, uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GlobalDataTable, GlobalTableHead } from "@/lib/data-table";
import type { PaginatedResult } from "@/lib/shared/pagination";
import { cn } from "@/utils/cn";

interface WarehouseStockTableProps {
  result: PaginatedResult<WarehouseInventoryListItem>;
  warehouses: WarehouseFilterOption[];
  locations: WarehouseLocationFilterOption[];
  currentWarehouseId?: string;
  currentLocationId?: string;
  currentSearch?: string;
}

interface WarehouseStockFilters {
  warehouse?: string;
  location?: string;
  q?: string;
}

function buildHref(
  page: number,
  limit: number,
  filters: WarehouseStockFilters = {},
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));
  if (filters.warehouse) params.set("warehouse", filters.warehouse);
  if (filters.location) params.set("location", filters.location);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();
  return query ? `/inventory/warehouse-stock?${query}` : "/inventory/warehouse-stock";
}

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function WarehouseStockTable({
  result,
  warehouses,
  locations,
  currentWarehouseId,
  currentLocationId,
  currentSearch,
}: WarehouseStockTableProps) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(currentWarehouseId ?? "");
  const [locationId, setLocationId] = useState(currentLocationId ?? "");
  const [search, setSearch] = useState(currentSearch ?? "");
  const pageSize = parseTablePageSize(result.limit);
  const rows = result.items;

  const activeFilters: WarehouseStockFilters = {
    warehouse: currentWarehouseId,
    location: currentLocationId,
    q: currentSearch,
  };
  const hasActiveFilters = Boolean(
    currentWarehouseId || currentLocationId || currentSearch,
  );

  const locationOptions = useMemo(() => {
    const scoped = warehouseId
      ? locations.filter((loc) => loc.warehouseId === warehouseId)
      : locations;
    return scoped;
  }, [locations, warehouseId]);

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        rows.map((row) => row.serialNumber.serialNo),
        rows.map((row) => row.serialNumber.model.sku),
        rows.map((row) => row.warehouse.code),
        rows.map((row) => row.location.code),
      ),
    [rows],
  );

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(buildHref(1, limit, activeFilters));
  }

  function applyFilters() {
    router.push(
      buildHref(1, pageSize, {
        warehouse: warehouseId || undefined,
        location: locationId || undefined,
        q: search.trim() || undefined,
      }),
    );
  }

  function clearFilters() {
    setWarehouseId("");
    setLocationId("");
    setSearch("");
    router.push("/inventory/warehouse-stock");
  }

  function handleWarehouseChange(value: string) {
    const next = value === "all" ? "" : value;
    setWarehouseId(next);
    setLocationId("");
  }

  const emptyMessage = hasActiveFilters
    ? "No warehouse serials match your filters."
    : "No warehouse stock yet. Serials appear after a warehouse feed, demo seed, or Official Sales warehouse demo serials are loaded.";

  return (
    <GlobalDataTable
      stickyHeader
      empty={rows.length === 0}
      emptyMessage={emptyMessage}
      banner={
        <div className="space-y-4 border-b px-4 py-4">
          <TableSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search serial number or SKU…"
            suggestions={suggestions}
          />

          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-3">
            <SearchableSelect
              label="Warehouse"
              id="warehouse-stock-warehouse"
              className="lg:w-64"
              options={[
                { id: "all", label: "All warehouses" },
                ...warehouses.map((w) => ({
                  id: w.id,
                  label: `${w.code} — ${w.name}`,
                })),
              ]}
              value={warehouseId || "all"}
              onChange={handleWarehouseChange}
              searchPlaceholder="Search warehouses…"
            />

            <SearchableSelect
              label="Location"
              id="warehouse-stock-location"
              className="lg:w-56"
              options={[
                { id: "all", label: "All locations" },
                ...locationOptions.map((loc) => ({
                  id: loc.id,
                  label: `${loc.code} — ${loc.name}`,
                })),
              ]}
              value={locationId || "all"}
              onChange={(value) => setLocationId(value === "all" ? "" : value)}
              searchPlaceholder="Search locations…"
              disabled={!warehouseId && locationOptions.length === 0}
            />

            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="outline" onClick={clearFilters}>
                Clear
              </Button>
              <Button type="button" onClick={applyFilters}>
                Apply filters
              </Button>
            </div>
          </div>
        </div>
      }
      pagination={{
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        itemLabel: "serial",
        buildHref: (page) => buildHref(page, pageSize, activeFilters),
      }}
      pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
    >
      <TableHeader>
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableIndexHead />
          <GlobalTableHead>Serial No.</GlobalTableHead>
          <GlobalTableHead>SKU</GlobalTableHead>
          <GlobalTableHead>Model</GlobalTableHead>
          <GlobalTableHead>Warehouse</GlobalTableHead>
          <GlobalTableHead>Location</GlobalTableHead>
          <GlobalTableHead>Status</GlobalTableHead>
          <GlobalTableHead>Updated</GlobalTableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow
            key={row.id}
            className={cn(index % 2 === 1 && "bg-table-stripe")}
          >
            <TableIndexCell
              index={(result.page - 1) * result.limit + index + 1}
            />
            <TableCell className="font-mono text-sm">
              {row.serialNumber.serialNo}
            </TableCell>
            <TableCell className="font-mono text-sm">
              {row.serialNumber.model.sku}
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span>{row.serialNumber.model.name}</span>
                <span className="text-xs text-muted-foreground">
                  {row.serialNumber.model.brand.name}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-mono text-sm">{row.warehouse.code}</span>
                <span className="text-xs text-muted-foreground">
                  {row.warehouse.name}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-mono text-sm">{row.location.code}</span>
                <span className="text-xs text-muted-foreground">
                  {row.location.name}
                </span>
              </div>
            </TableCell>
            <TableCell>
              {row.systemStatus ? (
                <Badge variant="secondary">{row.systemStatus}</Badge>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
              {formatUpdatedAt(row.updatedAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </GlobalDataTable>
  );
}
