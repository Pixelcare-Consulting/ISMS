"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createWarehouseAction,
  addWarehouseLocationAction,
  deleteWarehouseAction,
  deleteWarehouseLocationAction,
} from "@/features/warehouses/actions/warehouse.actions";
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
import { GlobalDataTable, GlobalTableHead } from "@/lib/data-table";
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
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<WarehouseRow | null>(null);
  const [deletingLocation, setDeletingLocation] = useState<{
    warehouseId: string;
    location: LocationRow;
  } | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [locCode, setLocCode] = useState("");
  const [locName, setLocName] = useState("");

  useEffect(() => {
    setRows(warehouses);
  }, [warehouses]);

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

  const selection = useTableSelection(filtered.map((warehouse) => warehouse.id));
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
    indexOffset,
  } = useClientTablePagination(filtered, { resetKey: query });

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
      setDeleting(null);
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
            count={selection.selectedCount}
            onClear={selection.clearSelection}
          />
        }
        toolbarActions={
          <>
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
                  aria-label="Select all warehouses"
                />
                <TableIndexHead />
                <GlobalTableHead>Code</GlobalTableHead>
                <GlobalTableHead>Name</GlobalTableHead>
                <GlobalTableHead>Locations</GlobalTableHead>
                <GlobalTableHead>Links</GlobalTableHead>
                <GlobalTableHead className="w-28 text-right">Actions</GlobalTableHead>
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
                      />
                    </TableRow>
                    {expandedId === w.id ? (
                      <TableRow key={`${w.id}-locations`}>
                        <TableCell colSpan={COL_COUNT} className="bg-muted/30">
                          <div className="space-y-2 py-2">
                            {w.locations.map((loc) => (
                              <div
                                key={loc.id}
                                className="flex items-center justify-between text-sm"
                              >
                                <span>
                                  <span className="font-mono">{loc.code}</span> — {loc.name}
                                </span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={pending}
                                  onClick={() =>
                                    setDeletingLocation({ warehouseId: w.id, location: loc })
                                  }
                                >
                                  Remove
                                </Button>
                              </div>
                            ))}
                            <div className="flex flex-wrap items-center gap-2 pt-2">
                              <Input
                                placeholder="Loc code"
                                value={locCode}
                                onChange={(e) => setLocCode(e.target.value)}
                                className="h-8 w-24"
                              />
                              <Input
                                placeholder="Loc name"
                                value={locName}
                                onChange={(e) => setLocName(e.target.value)}
                                className="h-8 w-36"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pending || !locCode || !locName}
                                onClick={() => addLocation(w.id)}
                              >
                                Add location
                              </Button>
                            </div>
                          </div>
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
            ? `Remove ${deleting.name} (${deleting.code}) and all locations.`
            : ""
        }
        onConfirm={handleDelete}
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
