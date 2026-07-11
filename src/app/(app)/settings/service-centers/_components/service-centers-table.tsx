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
  AppDataTable,
  AppDataTableBody,
  DeleteConfirmDialog,
  TableEmptyRow,
  TableRowActions,
  TableSearchBar,
  uniqueSearchSuggestions,
} from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
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

  async function loadAreas() {
    if (areas.length) return;
    const opts = await listServiceCenterFormOptionsAction();
    setAreas(opts.areas);
  }

  function createCenter() {
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
      setSapCode("");
      setName("");
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
      <div
        className="flex flex-wrap gap-2 rounded-xl border bg-card p-4 shadow-sm"
        onFocus={() => {
          void loadAreas();
        }}
      >
        <div>
          <Label>SAP code</Label>
          <Input value={sapCode} onChange={(e) => setSapCode(e.target.value)} />
        </div>
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Area</Label>
          <select
            className="flex h-9 rounded-md border bg-background px-2 text-sm"
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
          >
            <option value="">—</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <Button className="self-end" disabled={pending || !sapCode || !name} onClick={createCenter}>
          <Plus className="size-4" />
          Add center
        </Button>
      </div>

      <AppDataTable
        shellHeader={
          <TableSearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search service centers…"
            suggestions={suggestions}
            className="sm:max-w-sm"
          />
        }
      >
        <AppDataTableBody>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>SAP</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Locations</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow colSpan={COL_COUNT} message={emptyMessage} />
              ) : (
                filtered.map((row, index) => (
                  <Fragment key={row.id}>
                    <TableRow className={cn(index % 2 === 1 && "bg-table-stripe")}>
                      <TableCell>{row.sapCode}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.area?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Button
                          variant="link"
                          className="h-auto p-0"
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
          </Table>
        </AppDataTableBody>
      </AppDataTable>

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
