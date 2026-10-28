"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { WarehouseInventoryListItem } from "@/features/warehouse-inventory/actions/warehouse-inventory.actions";
import type {
  WarehouseFilterOption,
  WarehouseLocationFilterOption,
} from "@/features/warehouse-inventory/services/warehouse-inventory.service";
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
  DataTable,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import type { PaginatedResult } from "@/lib/shared/pagination";
import { EditLocationDialog } from "@/app/(app)/inventory/warehouse-stock/_components/edit-location-dialog";

interface WarehouseStockTableProps {
  result: PaginatedResult<WarehouseInventoryListItem>;
  /** warehouses.manage: may move a serial to another location in its warehouse. */
  canEditLocation: boolean;
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

const stockColumn = createColumnHelper<DataTableFeatures, WarehouseInventoryListItem>();

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function WarehouseStockTable({
  result,
  canEditLocation,
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
  const [editing, setEditing] = useState<WarehouseInventoryListItem | null>(null);
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
    : "No serials have a warehouse location. Stock comes from SAP; serials SAP holds in a warehouse are dispatched from there without a location.";

  const indexOffset = (result.page - 1) * result.limit;
  const columns = useMemo(() => {
    const cols: DataTableColumn<WarehouseInventoryListItem>[] = [
      stockColumn.display({
        id: "index",
        header: "#",
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "text-center tabular-nums text-muted-foreground" },
      }),
      stockColumn.accessor((row) => row.serialNumber.serialNo, {
        id: "serial",
        header: "Serial No.",
        meta: { className: "font-mono" },
      }),
      stockColumn.accessor((row) => row.serialNumber.model.sku, {
        id: "sku",
        header: "SKU",
        meta: { className: "font-mono" },
      }),
      stockColumn.display({
        id: "model",
        header: "Model",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{row.original.serialNumber.model.name}</span>
            <span className="text-xs text-muted-foreground">
              {row.original.serialNumber.model.brand.name}
            </span>
          </div>
        ),
      }),
      stockColumn.display({
        id: "warehouse",
        header: "Warehouse",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-mono text-sm">{row.original.warehouse.code}</span>
            <span className="text-xs text-muted-foreground">{row.original.warehouse.name}</span>
          </div>
        ),
      }),
      stockColumn.display({
        id: "location",
        header: "Location",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-mono text-sm">{row.original.location.code}</span>
            <span className="text-xs text-muted-foreground">{row.original.location.name}</span>
          </div>
        ),
      }),
      stockColumn.display({
        id: "heldBy",
        header: "Held by",
        cell: ({ row }) =>
          row.original.branch ? (
            <div className="flex flex-col">
              <span>{row.original.branch.name}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {row.original.branch.sapCode ?? "Branch stock"}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">Warehouse</span>
          ),
      }),
      stockColumn.display({
        id: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.systemStatus ? (
            <Badge variant="secondary">{row.original.systemStatus}</Badge>
          ) : (
            "—"
          ),
      }),
      stockColumn.display({
        id: "updated",
        header: "Updated",
        cell: ({ row }) => formatUpdatedAt(row.original.updatedAt),
        meta: { className: "text-muted-foreground" },
      }),
    ];
    if (canEditLocation) {
      cols.push(
        stockColumn.display({
          id: "actions",
          header: "Actions",
          cell: ({ row }) => (
            <Button
              size="sm"
              variant="outline"
              className="max-sm:h-11"
              onClick={() => setEditing(row.original)}
            >
              Edit location
            </Button>
          ),
          meta: { align: "end" },
        }),
      );
    }
    return cols;
  }, [canEditLocation, indexOffset]);

  return (
    <>
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      manualPagination
      stickyHeader
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
      empty={rows.length === 0}
      emptyMessage={emptyMessage}
    />
    <EditLocationDialog row={editing} onClose={() => setEditing(null)} />
    </>
  );
}
