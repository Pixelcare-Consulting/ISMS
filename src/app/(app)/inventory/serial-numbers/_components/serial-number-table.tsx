"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import type { LookupRecordStatus } from "@prisma/client";

import {
  createSerialNumberAction,
  setSerialNumberStatusAction,
  updateSerialNumberAction,
} from "@/features/serial-numbers/actions/serial-number.actions";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  DataTableEmpty,
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SerialModelOption {
  id: string;
  skuCode: string;
  name: string;
}

interface SerialInventorySnapshot {
  branch: { id: string; name: string } | null;
  statusCode: { id: string; code: string; name: string } | null;
}

interface SerialNumberRow {
  id: string;
  serialNo: string;
  recordStatus: LookupRecordStatus;
  model: { id: string; skuCode: string; name: string; brand: { name: string } | null };
  branchInventories: SerialInventorySnapshot[];
}

interface SerialNumberTableProps {
  result: {
    items: SerialNumberRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  modelOptions: SerialModelOption[];
  canManage: boolean;
  currentSearch?: string;
  currentStatus?: LookupRecordStatus;
}

function buildHref(
  page: number,
  filters: { q?: string; status?: LookupRecordStatus } = {},
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  return query ? `/inventory/serial-numbers?${query}` : "/inventory/serial-numbers";
}

export function SerialNumberTable({
  result,
  modelOptions,
  canManage,
  currentSearch,
  currentStatus,
}: SerialNumberTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState(currentSearch ?? "");
  const [status, setStatus] = useState<string>(currentStatus ?? "");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SerialNumberRow | null>(null);
  const [formSerialNo, setFormSerialNo] = useState("");
  const [formModelId, setFormModelId] = useState("");
  const [pending, startTransition] = useTransition();

  const rows = result.items;
  const activeFilters = { q: currentSearch, status: currentStatus };
  const hasActiveFilters = Boolean(currentSearch || currentStatus);

  const modelLabelById = useMemo(
    () => new Map(modelOptions.map((m) => [m.id, `${m.skuCode} — ${m.name}`])),
    [modelOptions],
  );

  function applyFilters() {
    router.push(
      buildHref(1, {
        q: search.trim() || undefined,
        status: (status || undefined) as LookupRecordStatus | undefined,
      }),
    );
  }

  function clearFilters() {
    setSearch("");
    setStatus("");
    router.push("/inventory/serial-numbers");
  }

  function openCreate() {
    setEditing(null);
    setFormSerialNo("");
    setFormModelId("");
    setOpen(true);
  }

  function openEdit(row: SerialNumberRow) {
    setEditing(row);
    setFormSerialNo(row.serialNo);
    setFormModelId(row.model.id);
    setOpen(true);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { serialNo: formSerialNo, modelId: formModelId };
    startTransition(async () => {
      const outcome = editing
        ? await updateSerialNumberAction(editing.id, payload)
        : await createSerialNumberAction(payload);
      if (outcome.error) {
        toast.error(outcome.error);
        return;
      }
      toast.success(editing ? "Serial number updated" : "Serial number created");
      setOpen(false);
      router.refresh();
    });
  }

  function toggleStatus(row: SerialNumberRow) {
    const next: LookupRecordStatus =
      row.recordStatus === "active" ? "inactive" : "active";
    startTransition(async () => {
      const outcome = await setSerialNumberStatusAction(row.id, {
        recordStatus: next,
      });
      if (outcome.error) {
        toast.error(outcome.error);
        return;
      }
      toast.success(next === "active" ? "Serial activated" : "Serial deactivated");
      router.refresh();
    });
  }

  return (
    <DataTableShell>
      <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="serial-search">Search</Label>
            <Input
              id="serial-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              placeholder="Serial no, SKU, or model…"
              className="sm:w-64"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="serial-status">Status</Label>
            <Select
              value={status || "all"}
              onValueChange={(value) => setStatus(value === "all" ? "" : value)}
            >
              <SelectTrigger id="serial-status" className="sm:w-40">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={clearFilters}>
              Clear
            </Button>
            <Button type="button" onClick={applyFilters}>
              Apply
            </Button>
          </div>
        </div>
        {canManage ? (
          <Button onClick={openCreate}>
            <Plus className="size-4" /> Add serial
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <DataTableEmpty
          message={
            hasActiveFilters
              ? "No serial numbers match your filters."
              : "No serial numbers yet."
          }
        />
      ) : (
        <>
          <DataTableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Serial no</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Current branch</TableHead>
                  <TableHead>Current status</TableHead>
                  <TableHead>Record</TableHead>
                  {canManage ? <TableHead className="w-48" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => {
                  const current = row.branchInventories[0] ?? null;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {(result.page - 1) * result.limit + index + 1}
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link
                          href={`/inventory/serial-numbers/${row.id}`}
                          className="font-mono text-sm underline-offset-4 hover:underline"
                        >
                          {row.serialNo}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{row.model.skuCode}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.model.name}
                        </div>
                      </TableCell>
                      <TableCell>{current?.branch?.name ?? "—"}</TableCell>
                      <TableCell>
                        {current?.statusCode ? (
                          <StatusCodeBadge
                            code={current.statusCode.code}
                            name={current.statusCode.name}
                          />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.recordStatus === "active" ? "default" : "secondary"
                          }
                        >
                          {row.recordStatus === "active" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex justify-end gap-2 whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() => openEdit(row)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() => toggleStatus(row)}
                            >
                              {row.recordStatus === "active"
                                ? "Deactivate"
                                : "Activate"}
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </DataTableScroll>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              {result.total} serial{result.total === 1 ? "" : "s"} · page{" "}
              {result.page} of {result.totalPages}
            </span>
            <div className="flex gap-2">
              {result.page > 1 ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={buildHref(result.page - 1, activeFilters)}>
                    Previous
                  </Link>
                </Button>
              ) : null}
              {result.page < result.totalPages ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={buildHref(result.page + 1, activeFilters)}>Next</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </>
      )}

      {canManage ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit serial number" : "Add serial number"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="serial-no">Serial number</Label>
                <Input
                  id="serial-no"
                  value={formSerialNo}
                  onChange={(e) => setFormSerialNo(e.target.value)}
                  className="font-mono"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serial-model">Model</Label>
                <select
                  id="serial-model"
                  value={formModelId}
                  onChange={(e) => setFormModelId(e.target.value)}
                  required
                  className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                >
                  <option value="">Select model…</option>
                  {modelOptions.map((model) => (
                    <option key={model.id} value={model.id}>
                      {modelLabelById.get(model.id)}
                    </option>
                  ))}
                </select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={pending || !formModelId}>
                  {editing ? "Save changes" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </DataTableShell>
  );
}
