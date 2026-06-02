"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createWarehouseAction,
  createWarehouseLocationAction,
  deleteWarehouseAction,
  deleteWarehouseLocationAction,
} from "@/features/warehouses/actions/warehouse.actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/data-table/delete-confirm-dialog";
import {
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { TableSearchToolbar } from "@/components/data-table/table-search-bar";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

export function WarehousesTable({ warehouses }: { warehouses: WarehouseRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(warehouses);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<WarehouseRow | null>(null);
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
      const result = await createWarehouseLocationAction({
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

  function removeLocation(warehouseId: string, locationId: string) {
    startTransition(async () => {
      const result = await deleteWarehouseLocationAction(warehouseId, locationId);
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
                locations: warehouse.locations.filter((location) => location.id !== locationId),
              }
            : warehouse,
        ),
      );
      router.refresh();
    });
  }

  return (
    <DataTableShell>
      <TableSearchToolbar value={query} onChange={setQuery} placeholder="Search warehouses…">
        <div className="flex flex-wrap items-center gap-2">
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
          <Button size="sm" disabled={pending || !newCode || !newName} onClick={createWarehouse}>
            <Plus className="mr-1 h-4 w-4" />
            Add warehouse
          </Button>
        </div>
      </TableSearchToolbar>
      <DataTableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Locations</TableHead>
              <TableHead>Links</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center">
                  No warehouses yet.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((w) => (
                <Fragment key={w.id}>
                  <TableRow>
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
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setDeleting(w)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedId === w.id ? (
                    <TableRow key={`${w.id}-locations`}>
                      <TableCell colSpan={5} className="bg-muted/30">
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
                                onClick={() => removeLocation(w.id, loc.id)}
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
        </Table>
      </DataTableScroll>

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
    </DataTableShell>
  );
}
