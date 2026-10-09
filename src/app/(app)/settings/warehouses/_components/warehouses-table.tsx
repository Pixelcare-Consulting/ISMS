"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package } from "lucide-react";
import { toast } from "sonner";

import {
  addWarehouseLocationAction,
  deleteWarehouseLocationAction,
  syncWarehousesFromSapAction,
} from "@/features/warehouses/actions/warehouse.actions";
import { SapSyncButton } from "@/features/sap/components/sap-sync-button";
import {
  DeleteConfirmDialog,
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowActions,
  uniqueSearchSuggestions,
  useClientTablePagination,
} from "@/components/data-table";
import { GlobalDataTable, GlobalTableHead, useClientTableSort } from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/utils/cn";
import { matchesTableSearch } from "@/utils/match-table-search";

import { WarehouseLocationsPanel } from "./warehouse-locations-panel";

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

const COL_COUNT = 6;

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [locCode, setLocCode] = useState("");
  const [locName, setLocName] = useState("");

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

  function addLocation(warehouseId: string) {
    startTransition(async () => {
      const result = await addWarehouseLocationAction({
        warehouseId,
        code: locCode,
        name: locName,
      });
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
      setLocCode("");
      setLocName("");
      router.refresh();
    });
  }

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

  return (
    <>
      <GlobalDataTable
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
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "warehouse",
          onPageChange: setPage,
        }}
      >
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableIndexHead />
                <GlobalTableHead {...sort.sortProps("code")}>Code</GlobalTableHead>
                <GlobalTableHead {...sort.sortProps("name")}>Name</GlobalTableHead>
                <GlobalTableHead {...sort.sortProps("locations")}>Locations</GlobalTableHead>
                <GlobalTableHead {...sort.sortProps("links")}>Links</GlobalTableHead>
                <GlobalTableHead className="w-36 text-right">Actions</GlobalTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow colSpan={COL_COUNT} message={emptyMessage} />
              ) : (
                pageItems.map((w, index) => (
                  <Fragment key={w.id}>
                    <TableRow className={cn(index % 2 === 1 && "bg-table-stripe")}>
                      <TableIndexCell index={indexOffset + index + 1} />
                      <TableCell className="font-mono text-sm">
                        {w.code}
                        {w.isMain ? (
                          <Badge variant="secondary" className="ml-2">
                            Main
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>{w.name}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpandedId(expandedId === w.id ? null : w.id)}
                        >
                          {w.locations.length} location{w.locations.length === 1 ? "" : "s"}
                        </Button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {w._count.aors} AOR · {w._count.pulloutsDestination} pull-outs
                      </TableCell>
                      <TableRowActions>
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          title="View warehouse stock"
                        >
                          <Link
                            href={`/inventory/warehouse-stock?warehouse=${w.id}`}
                          >
                            <Package className="mr-1 h-3.5 w-3.5" />
                            Stock
                          </Link>
                        </Button>
                      </TableRowActions>
                    </TableRow>
                    {expandedId === w.id ? (
                      <TableRow key={`${w.id}-locations`} className="hover:bg-transparent">
                        <TableCell colSpan={COL_COUNT} className="p-2 sm:p-3">
                          <WarehouseLocationsPanel
                            warehouseId={w.id}
                            warehouseName={w.name}
                            locations={w.locations}
                            locCode={locCode}
                            locName={locName}
                            pending={pending}
                            onLocCodeChange={setLocCode}
                            onLocNameChange={setLocName}
                            onAdd={addLocation}
                            onRemove={(warehouseId, location) =>
                              setDeletingLocation({ warehouseId, location })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                ))
              )}
            </TableBody>
      </GlobalDataTable>

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
