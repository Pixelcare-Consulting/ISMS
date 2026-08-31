"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  TableIndexCell,
  TableIndexHead,
  uniqueSearchSuggestions,
} from "@/components/data-table";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { GlobalDataTable, GlobalTableHead, nextTableSort } from "@/lib/data-table";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  TableBody,
  TableCell,
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
  statusCode: { id: string; code: string; name: string; color?: string | null } | null;
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
  initialSort?: string;
  initialSortDir?: string;
}

type SerialNumberSortField = "serialNo" | "model" | "recordStatus";
type SerialNumberSortDir = "asc" | "desc";

function buildHref(
  page: number,
  limit: number,
  filters: { q?: string; status?: LookupRecordStatus; sort?: string; sortDir?: string } = {},
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.sort && filters.sortDir) params.set("dir", filters.sortDir);
  const query = params.toString();
  return query ? `/inventory/serial-numbers?${query}` : "/inventory/serial-numbers";
}

export function SerialNumberTable({
  result,
  modelOptions,
  canManage,
  currentSearch,
  currentStatus,
  initialSort = "",
  initialSortDir = "desc",
}: SerialNumberTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentSearch ?? "");
  const [status, setStatus] = useState<string>(currentStatus ?? "");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SerialNumberRow | null>(null);
  const [formSerialNo, setFormSerialNo] = useState("");
  const [formModelId, setFormModelId] = useState("");
  const [pending, startTransition] = useTransition();
  const pageSize = parseTablePageSize(result.limit);
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as SerialNumberSortDir;

  const rows = result.items;
  const activeFilters = {
    q: currentSearch,
    status: currentStatus,
    sort: sort || undefined,
    sortDir: sort ? sortDir : undefined,
  };
  const hasActiveFilters = Boolean(currentSearch || currentStatus);

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(buildHref(1, limit, activeFilters));
  }

  function toggleSort(field: SerialNumberSortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(
      buildHref(1, pageSize, {
        q: currentSearch,
        status: currentStatus,
        sort: next.sort,
        sortDir: next.dir,
      }),
    );
  }

  const modelLabelById = useMemo(
    () => new Map(modelOptions.map((m) => [m.id, `${m.skuCode} — ${m.name}`])),
    [modelOptions],
  );
  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        result.items.map((row) => row.serialNo),
        result.items.map((row) => row.model.skuCode),
        result.items.map((row) => row.model.name),
      ),
    [result.items],
  );

  function applyFilters() {
    router.push(
      buildHref(1, pageSize, {
        q: search.trim() || undefined,
        status: (status || undefined) as LookupRecordStatus | undefined,
        sort: sort || undefined,
        sortDir: sort ? sortDir : undefined,
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
    <>
      <GlobalDataTable
        stickyHeader
        scrollable
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Serial no, SKU, or model…",
          suggestions,
        }}
        toolbarActions={
          <>
            {/*
              No sync control here on purpose: serials are children of a model, so they
              are pulled by the model sync in the same run that guarantees their model
              exists. The note points to where that runs.
            */}
            <p className="text-muted-foreground hidden text-xs sm:block">
              Synced from SAP with Models
            </p>
            <SearchableSelect
              id="serial-status"
              className="sm:w-40"
              options={[
                { id: "all", label: "All statuses" },
                { id: "active", label: "Active" },
                { id: "inactive", label: "Inactive" },
              ]}
              value={status || "all"}
              onChange={(value) => setStatus(value === "all" ? "" : value)}
              searchPlaceholder="Search status…"
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={clearFilters}>
                Clear
              </Button>
              <Button type="button" onClick={applyFilters}>
                Apply
              </Button>
            </div>
            {canManage ? (
              <Button onClick={openCreate}>
                <Plus className="size-4" /> Add serial
              </Button>
            ) : null}
          </>
        }
        pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
        pagination={{
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          itemLabel: "serial",
          buildHref: (page) => buildHref(page, pageSize, activeFilters),
        }}
        footer={
          rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {hasActiveFilters
                ? "No serial numbers match your filters."
                : "No serial numbers yet."}
            </p>
          ) : null
        }
      >
        {rows.length > 0 ? (
          <>
            <TableHeader>
              <TableRow>
                <TableIndexHead />
                <GlobalTableHead
                  sortKey="serialNo"
                  activeSortKey={sort}
                  sortDirection={sortDir}
                  onSort={(key) => toggleSort(key as SerialNumberSortField)}
                >
                  Serial no
                </GlobalTableHead>
                <GlobalTableHead
                  sortKey="model"
                  activeSortKey={sort}
                  sortDirection={sortDir}
                  onSort={(key) => toggleSort(key as SerialNumberSortField)}
                >
                  Model
                </GlobalTableHead>
                <GlobalTableHead>Current branch</GlobalTableHead>
                <GlobalTableHead>Current status</GlobalTableHead>
                <GlobalTableHead
                  sortKey="recordStatus"
                  activeSortKey={sort}
                  sortDirection={sortDir}
                  onSort={(key) => toggleSort(key as SerialNumberSortField)}
                >
                  Record
                </GlobalTableHead>
                {canManage ? <GlobalTableHead className="w-48" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((row, index) => {
                  const current = row.branchInventories[0] ?? null;
                  return (
                    <TableRow key={row.id}>
                      <TableIndexCell index={(result.page - 1) * result.limit + index + 1} />
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
                            color={current.statusCode.color}
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
          </>
        ) : null}
      </GlobalDataTable>

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
              <SearchableSelect
                label="Model"
                id="serial-model"
                options={modelOptions.map((model) => ({
                  id: model.id,
                  label: modelLabelById.get(model.id) ?? model.id,
                }))}
                value={formModelId}
                onChange={setFormModelId}
                placeholder="Select model…"
                searchPlaceholder="Search models…"
                disabled={pending}
              />
              <DialogFooter>
                <Button type="submit" disabled={pending || !formModelId}>
                  {editing ? "Save changes" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
