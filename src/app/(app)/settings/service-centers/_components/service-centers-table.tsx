"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  addServiceCenterLocationAction,
  createServiceCenterAction,
  deleteServiceCenterAction,
  deleteServiceCenterLocationAction,
  listServiceCenterFormOptionsAction,
} from "@/features/service-centers/actions/service-center.actions";
import {
  DeleteConfirmDialog,
  TableEmptyRow,
  TableRowActions,
  uniqueSearchSuggestions,
  useClientTablePagination,
} from "@/components/data-table";
import { GlobalDataTable, GlobalTableHead } from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

interface CenterRow {
  id: string;
  sapCode: string;
  name: string;
  status: string;
  area: { name: string } | null;
  locations: LocationRow[];
}

const COL_COUNT = 5;

export function ServiceCentersTable({ centers }: { centers: CenterRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(centers);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<CenterRow | null>(null);
  const [deletingLocation, setDeletingLocation] = useState<{
    centerId: string;
    location: LocationRow;
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [sapCode, setSapCode] = useState("");
  const [name, setName] = useState("");
  const [areaId, setAreaId] = useState("");
  const [areas, setAreas] = useState<{ id: string; name: string }[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [locCode, setLocCode] = useState("");
  const [locName, setLocName] = useState("");

  useEffect(() => {
    setRows(centers);
  }, [centers]);

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesTableSearch(query, [
          row.sapCode,
          row.name,
          row.area?.name ?? "",
          ...row.locations.map((l) => l.code),
        ]),
      ),
    [rows, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        rows.map((row) => row.sapCode),
        rows.map((row) => row.name),
        rows.map((row) => row.area?.name),
        rows.flatMap((row) => row.locations.map((l) => l.code)),
      ),
    [rows],
  );

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
  } = useClientTablePagination(filtered, { resetKey: query });

  async function loadAreas() {
    if (areas.length) return;
    const opts = await listServiceCenterFormOptionsAction();
    setAreas(opts.areas);
  }

  function resetAddForm() {
    setSapCode("");
    setName("");
    setAreaId("");
  }

  function onAddOpenChange(open: boolean) {
    setAddOpen(open);
    if (open) {
      void loadAreas();
    } else {
      resetAddForm();
    }
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createServiceCenterAction({
        sapCode,
        name,
        areaId: areaId || null,
      });
      if (result.error) {
        toast.error(String(result.error));
        return;
      }
      toast.success("Service center created");
      onAddOpenChange(false);
      router.refresh();
    });
  }

  function addLocation(serviceCenterId: string) {
    startTransition(async () => {
      const result = await addServiceCenterLocationAction({
        serviceCenterId,
        code: locCode,
        name: locName,
      });
      if (result.error) {
        toast.error(String(result.error));
        return;
      }
      toast.success("Location added");
      setLocCode("");
      setLocName("");
      router.refresh();
    });
  }

  function removeLocation() {
    if (!deletingLocation) return;
    const { centerId, location } = deletingLocation;

    startTransition(async () => {
      const result = await deleteServiceCenterLocationAction(location.id);
      if (result.error) {
        toast.error(String(result.error));
        return;
      }
      toast.success("Location removed");
      setRows((currentRows) =>
        currentRows.map((center) =>
          center.id === centerId
            ? {
                ...center,
                locations: center.locations.filter((loc) => loc.id !== location.id),
              }
            : center,
        ),
      );
      setDeletingLocation(null);
      router.refresh();
    });
  }

  const emptyMessage =
    rows.length === 0
      ? "No service centers yet."
      : "No service centers match your search.";

  return (
    <div className="space-y-4">
      <GlobalDataTable
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search service centers…",
          suggestions,
        }}
        toolbarActions={
          <Button type="button" size="sm" onClick={() => onAddOpenChange(true)}>
            <Plus className="size-3.5" />
            Add center
          </Button>
        }
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "service center",
          onPageChange: setPage,
        }}
      >
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <GlobalTableHead>SAP</GlobalTableHead>
                <GlobalTableHead>Name</GlobalTableHead>
                <GlobalTableHead>Area</GlobalTableHead>
                <GlobalTableHead>Locations</GlobalTableHead>
                <GlobalTableHead className="w-28 text-right">Actions</GlobalTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow colSpan={COL_COUNT} message={emptyMessage} />
              ) : (
                pageItems.map((row, index) => (
                  <Fragment key={row.id}>
                    <TableRow className={cn(index % 2 === 1 && "bg-table-stripe")}>
                      <TableCell>{row.sapCode}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.area?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setExpandedId((current) => (current === row.id ? null : row.id))
                          }
                        >
                          {row.locations.length} location(s)
                        </Button>
                      </TableCell>
                      <TableRowActions onDelete={() => setDeleting(row)} />
                    </TableRow>
                    {expandedId === row.id ? (
                      <TableRow>
                        <TableCell colSpan={COL_COUNT}>
                          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                            {row.locations.map((loc) => (
                              <div
                                key={loc.id}
                                className="flex items-center justify-between text-sm"
                              >
                                <span>
                                  {loc.code} — {loc.name}
                                </span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={pending}
                                  onClick={() =>
                                    setDeletingLocation({
                                      centerId: row.id,
                                      location: loc,
                                    })
                                  }
                                >
                                  Remove
                                </Button>
                              </div>
                            ))}
                            <div className="flex flex-wrap gap-2 pt-2">
                              <Input
                                placeholder="Code"
                                value={locCode}
                                onChange={(e) => setLocCode(e.target.value)}
                                className="w-28"
                              />
                              <Input
                                placeholder="Name"
                                value={locName}
                                onChange={(e) => setLocName(e.target.value)}
                                className="w-40"
                              />
                              <Button
                                size="sm"
                                disabled={pending || !locCode || !locName}
                                onClick={() => addLocation(row.id)}
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

      <Sheet open={addOpen} onOpenChange={onAddOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
            <SheetTitle>Add service center</SheetTitle>
            <SheetDescription>
              Create a service center with SAP code, name, and optional area.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleCreate} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="sc-sap">SAP code</Label>
                <Input
                  id="sc-sap"
                  value={sapCode}
                  onChange={(e) => setSapCode(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sc-name">Name</Label>
                <Input
                  id="sc-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <SearchableSelect
                label="Area"
                id="sc-area"
                options={areas.map((a) => ({ id: a.id, label: a.name }))}
                value={areaId}
                onChange={setAreaId}
                allowClear
                placeholder="—"
                searchPlaceholder="Search areas…"
                disabled={pending}
              />
            </div>
            <SheetFooter className="border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                onClick={() => onAddOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !sapCode || !name}>
                Add center
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <DeleteConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete service center?"
        description={deleting ? `Remove ${deleting.name}?` : "Remove this service center?"}
        onConfirm={() => {
          if (!deleting) return;
          startTransition(async () => {
            const result = await deleteServiceCenterAction(deleting.id);
            if (result.error) toast.error(String(result.error));
            else {
              toast.success("Deleted");
              setDeleting(null);
              router.refresh();
            }
          });
        }}
        pending={pending}
      />

      <DeleteConfirmDialog
        open={Boolean(deletingLocation)}
        onOpenChange={(open) => !open && setDeletingLocation(null)}
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
    </div>
  );
}
