"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, Package } from "lucide-react";
import { toast } from "sonner";

import {
  addWarehouseLocationAction,
  deleteWarehouseLocationAction,
  syncWarehousesFromSapAction,
} from "@/features/warehouses/actions/warehouse.actions";
import { SapSyncButton } from "@/features/sap/components/sap-sync-button";
import {
  DeleteConfirmDialog,
  TableRowActions,
  uniqueSearchSuggestions,
  useClientTablePagination,
} from "@/components/data-table";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { matchesTableSearch } from "@/utils/match-table-search";

const warehouseColumn = createColumnHelper<DataTableFeatures, WarehouseRow>();

import { WarehouseLocationsDialog } from "./warehouse-locations-dialog";

interface LocationRow {
  id: string;
  code: string;
  name: string;
}

interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  isMain: boolean;
  locations: LocationRow[];
  _count: { aors: number; pulloutsDestination: number };
}

export function WarehousesTable({
  warehouses,
  canSync,
}: {
  warehouses: WarehouseRow[];
  canSync: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(warehouses);
  const [rowsSource, setRowsSource] = useState(warehouses);
  if (warehouses !== rowsSource) {
    setRowsSource(warehouses);
    setRows(warehouses);
  }
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [deletingLocation, setDeletingLocation] = useState<{
    warehouseId: string;
    location: LocationRow;
  } | null>(null);
  const [locationsWarehouseId, setLocationsWarehouseId] = useState<string | null>(null);
  // Read from `rows` so the dialog shows adds and removes as soon as they land.
  const locationsWarehouse = rows.find((w) => w.id === locationsWarehouseId) ?? null;

  const filtered = useMemo(
    () =>
      rows.filter((w) =>
        matchesTableSearch(query, [w.code, w.name, ...w.locations.map((l) => l.code)]),
      ),
    [rows, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        rows.map((w) => w.code),
        rows.map((w) => w.name),
        rows.flatMap((w) => w.locations.map((l) => l.code)),
      ),
    [rows],
  );

  const sort = useClientTableSort(filtered, {
    code: (w) => w.code,
    name: (w) => w.name,
    locations: (w) => w.locations.length,
    links: (w) => w._count.aors + w._count.pulloutsDestination,
  });
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
    indexOffset,
  } = useClientTablePagination(sort.sorted, {
    resetKey: `${query}:${sort.sortKey}:${sort.sortDir}`,
  });

  const addLocation = useCallback(
    (warehouseId: string, code: string, name: string, onAdded: () => void) => {
    startTransition(async () => {
      const result = await addWarehouseLocationAction({ warehouseId, code, name });
      if (result.error) {
        toast.error(String(result.error));
        return;
      }
      toast.success("Location added");
      if (result.location) {
        setRows((currentRows) =>
          currentRows.map((warehouse) =>
            warehouse.id === warehouseId
              ? {
                  ...warehouse,
                  locations: [...warehouse.locations, result.location],
                }
              : warehouse,
          ),
        );
      }
      onAdded();
      router.refresh();
    });
    },
    [router],
  );

  function removeLocation() {
    if (!deletingLocation) return;
    const { warehouseId, location } = deletingLocation;

    startTransition(async () => {
      const result = await deleteWarehouseLocationAction(warehouseId, location.id);
      if (result.error) {
        toast.error(String(result.error));
        return;
      }
      toast.success("Location removed");
      setRows((currentRows) =>
        currentRows.map((warehouse) =>
          warehouse.id === warehouseId
            ? {
                ...warehouse,
                locations: warehouse.locations.filter((loc) => loc.id !== location.id),
              }
            : warehouse,
        ),
      );
      setDeletingLocation(null);
      router.refresh();
    });
  }

  const emptyMessage =
    rows.length === 0
      ? "No warehouses yet."
      : "No warehouses match your search.";

  const columns = useMemo(() => {
    const cols: DataTableColumn<WarehouseRow>[] = [
      warehouseColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      warehouseColumn.display({
        id: "code",
        header: "Code",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{row.original.code}</span>
            {row.original.isMain ? <Badge variant="secondary">Main</Badge> : null}
          </div>
        ),
      }),
      warehouseColumn.display({
        id: "name",
        header: "Name",
        enableSorting: true,
        cell: ({ row }) => row.original.name,
      }),
      warehouseColumn.display({
        id: "locations",
        header: "Locations",
        enableSorting: true,
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLocationsWarehouseId(row.original.id)}
          >
            <MapPin className="mr-1 h-3.5 w-3.5" />
            {row.original.locations.length} location
            {row.original.locations.length === 1 ? "" : "s"}
          </Button>
        ),
      }),
      warehouseColumn.display({
        id: "links",
        header: "Links",
        enableSorting: true,
        cell: ({ row }) =>
          `${row.original._count.aors} AOR · ${row.original._count.pulloutsDestination} pull-outs`,
        meta: { className: "text-sm text-muted-foreground" },
      }),
      warehouseColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <TableRowActions asCell={false}>
            <Button asChild size="sm" variant="ghost" title="View warehouse stock">
              <Link href={`/inventory/warehouse-stock?warehouse=${row.original.id}`}>
                <Package className="mr-1 h-3.5 w-3.5" />
                Stock
              </Link>
            </Button>
          </TableRowActions>
        ),
        meta: { align: "end" },
      }),
    ];
    return cols;
  }, [indexOffset]);

  return (
    <>
      <DataTable
        data={pageItems}
        columns={columns}
        getRowId={(row) => row.id}
        manualSorting
        manualPagination
        enableSorting
        sorting={{
          sortKey: sort.sortKey,
          sortDir: sort.sortDir,
          onSort: sort.toggleSort,
        }}
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search warehouses…",
          suggestions,
        }}
        toolbarActions={
          <>
              {canSync ? (
                <SapSyncButton
                  syncKey="warehouse"
                  noun={{ one: "warehouse", many: "warehouses" }}
                  onSync={syncWarehousesFromSapAction}
                />
              ) : null}
              {/* DO NOT DELETE - SAP is the source of truth for warehouses, so they are
                  created only by the sync above. Restoring this also needs the `Plus`
                  icon, `Input`, and `createWarehouseAction` imports, the `newCode`/`newName`
                  state, and the `createWarehouse` handler (kept at the end of this comment;
                  it goes back after the `useClientTablePagination` call).

              <Input
                placeholder="Code"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                className="h-9 w-28"
              />
              <Input
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-9 w-40"
              />
              <Button
                size="sm"
                disabled={pending || !newCode || !newName}
                onClick={createWarehouse}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add warehouse
              </Button>

  function createWarehouse() {
    startTransition(async () => {
      const result = await createWarehouseAction({ code: newCode, name: newName });
      if (result.error) {
        toast.error(String(result.error));
        return;
      }
      toast.success("Warehouse created");
      if (result.warehouse) {
        setRows((currentRows) => [
          {
            ...result.warehouse,
            locations: [],
            _count: { aors: 0, pulloutsDestination: 0 },
          },
          ...currentRows,
        ]);
      }
      setNewCode("");
      setNewName("");
      router.refresh();
    });
  } */}
          </>
        }
        empty={pageItems.length === 0}
        emptyMessage={emptyMessage}
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "warehouse",
          onPageChange: setPage,
        }}
      />

      <WarehouseLocationsDialog
        warehouse={locationsWarehouse}
        pending={pending}
        onOpenChange={(open) => {
          if (!open) setLocationsWarehouseId(null);
        }}
        onAdd={addLocation}
        onRemove={(warehouseId, location) => setDeletingLocation({ warehouseId, location })}
      />

      <DeleteConfirmDialog
        open={deletingLocation !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingLocation(null);
        }}
        title="Remove location?"
        description={
          deletingLocation
            ? `Remove location ${deletingLocation.location.code}?`
            : "Remove this location?"
        }
        confirmLabel="Remove"
        onConfirm={removeLocation}
        pending={pending}
      />
    </>
  );
}
