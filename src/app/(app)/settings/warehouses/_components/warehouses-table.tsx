"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createWarehouseAction,
  addWarehouseLocationAction,
  deleteWarehouseAction,
  deleteWarehousesAction,
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
  TableRowCheckbox,
  TableSelectAllCheckbox,
  TableSelectionBadge,
  uniqueSearchSuggestions,
  useClientTablePagination,
  useTableSelection,
} from "@/components/data-table";
import { GlobalDataTable, GlobalTableHead, useClientTableSort } from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const COL_COUNT = 7;

export function WarehousesTable({ warehouses }: { warehouses: WarehouseRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(warehouses);
  const [rowsSource, setRowsSource] = useState(warehouses);
  if (warehouses !== rowsSource) {
    setRowsSource(warehouses);
    setRows(warehouses);
  }
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<WarehouseRow | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deletingLocation, setDeletingLocation] = useState<{
    warehouseId: string;
    location: LocationRow;
  } | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
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

  const filteredIds = useMemo(() => filtered.map((warehouse) => warehouse.id), [filtered]);
  const selection = useTableSelection(filteredIds);
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
  }

  function handleDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteWarehouseAction(deleting.id);
      if (result.error) {
        toast.error(String(result.error));
        return;
      }
      toast.success("Warehouse removed");
      setRows((currentRows) =>
        currentRows.filter((warehouse) => warehouse.id !== deleting.id),
      );
      selection.clearSelection();
      setDeleting(null);
      router.refresh();
    });
  }

  function handleBulkDelete() {
    const ids = selection.selectedIds.filter((id) =>
      filteredIds.includes(id),
    );
    if (ids.length === 0) return;

    startTransition(async () => {
      const result = await deleteWarehousesAction({ warehouseIds: ids });
      if ("error" in result && result.error && !("deletedIds" in result)) {
        toast.error(String(result.error));
        return;
      }

      const deletedIds =
        "deletedIds" in result && Array.isArray(result.deletedIds)
          ? result.deletedIds
          : [];
      const failed =
        "failed" in result && Array.isArray(result.failed) ? result.failed : [];

      if (deletedIds.length > 0) {
        const deletedSet = new Set(deletedIds);
        setRows((currentRows) =>
          currentRows.filter((warehouse) => !deletedSet.has(warehouse.id)),
        );
      }

      selection.clearSelection();
      setBulkDeleteOpen(false);

      if (deletedIds.length > 0 && failed.length === 0) {
        toast.success(
          `Deleted ${deletedIds.length} warehouse${deletedIds.length === 1 ? "" : "s"}`,
        );
      } else if (deletedIds.length > 0 && failed.length > 0) {
        toast.success(
          `Deleted ${deletedIds.length} warehouse${deletedIds.length === 1 ? "" : "s"}`,
        );
        toast.error(
          `${failed.length} could not be deleted (linked AORs, pull-outs, or stock)`,
        );
      } else if (failed.length > 0) {
        toast.error(
          failed.length === 1
            ? failed[0]?.error ??
                "Could not delete warehouse (linked AORs, pull-outs, or stock)"
            : `None deleted — ${failed.length} warehouses still have links or stock`,
        );
      }

      router.refresh();
    });
  }

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

  const selectedCount = selection.selectedCount;

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
        toolbarLeading={
          <TableSelectionBadge
            count={selectedCount}
            onClear={selection.clearSelection}
            actions={
              selectedCount > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={pending}
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  <Trash2 className="size-4" />
                  Delete selected
                </Button>
              ) : null
            }
          />
        }
        toolbarActions={
          <>
              <SapSyncButton
                syncKey="warehouse"
                noun={{ one: "warehouse", many: "warehouses" }}
                onSync={syncWarehousesFromSapAction}
              />
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
                <TableSelectAllCheckbox
                  isAllSelected={selection.isAllSelected}
                  isPartiallySelected={selection.isPartiallySelected}
                  onToggleAll={selection.toggleAll}
                  aria-label="Select all matching warehouses"
                />
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
                    <TableRow
                      data-state={selection.isRowSelected(w.id) ? "selected" : undefined}
                      className={cn(index % 2 === 1 && "bg-table-stripe")}
                    >
                      <TableRowCheckbox
                        checked={selection.isRowSelected(w.id)}
                        onCheckedChange={(checked) => selection.toggleRow(w.id, checked)}
                        aria-label={`Select warehouse ${w.name}`}
                      />
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
                      <TableRowActions
                        onDelete={() => setDeleting(w)}
                        deleteDisabled={pending}
                      >
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
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete warehouse?"
        description={
          deleting
            ? `Remove ${deleting.name} (${deleting.code}) and all locations. Warehouses with linked AORs, pull-outs, or stock cannot be deleted.`
            : ""
        }
        onConfirm={handleDelete}
        pending={pending}
      />

      <DeleteConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          if (!open && !pending) setBulkDeleteOpen(false);
        }}
        title="Delete selected warehouses?"
        description={
          selectedCount === 1
            ? "Remove the selected warehouse and its locations. Warehouses with linked AORs, pull-outs, or stock will be skipped."
            : `Remove ${selectedCount} selected warehouses and their locations. Warehouses with linked AORs, pull-outs, or stock will be skipped.`
        }
        confirmLabel={
          selectedCount === 1 ? "Delete warehouse" : `Delete ${selectedCount} warehouses`
        }
        onConfirm={handleBulkDelete}
        pending={pending}
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
