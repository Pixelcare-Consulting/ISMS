"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";

import type { LookupRecordStatus } from "@prisma/client";

import {
  createSerialNumberAction,
  setSerialNumberStatusAction,
  syncSerialNumbersFromSapAction,
  updateSerialNumberAction,
} from "@/features/serial-numbers/actions/serial-number.actions";
import {
  FLAT_SERIAL_DEFAULT_SORT,
  FLAT_SERIAL_DEFAULT_SORT_DIR,
} from "@/features/serial-numbers/constants/flat-serial-sort";
import { SapSyncButton } from "@/features/sap/components/sap-sync-button";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { uniqueSearchSuggestions } from "@/components/data-table";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import {
  DataTable,
  nextTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
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

const serialColumn = createColumnHelper<DataTableFeatures, FlatSerialRow>();

interface SerialModelOption {
  id: string;
  skuCode: string;
  name: string;
}

interface FlatSerialRow {
  id: string;
  serialNo: string;
  recordStatus: LookupRecordStatus;
  lastSyncedAt?: Date | string | null;
  model: {
    id: string;
    skuCode: string;
    name: string;
  };
  branchCode: string | null;
  branchName: string | null;
  /** On-hand units of this model at the same branch; null when no location. */
  branchQty: number | null;
  statusCode: { code: string; name: string; color?: string | null } | null;
}

interface SerialNumberTableProps {
  result: {
    items: FlatSerialRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  modelOptions: SerialModelOption[];
  canManage: boolean;
  /** Sync from SAP — requires `sap.manage` (not branch PS / view-only roles). */
  canSync: boolean;
  currentSearch?: string;
  currentStatus?: LookupRecordStatus;
  initialSort?: string;
  initialSortDir?: string;
}

type FlatSerialSortField =
  | "serial"
  | "model"
  | "branch"
  | "status"
  | "record"
  | "lastSync";
type FlatSerialSortDir = "asc" | "desc";

const lastSyncFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatLastSync(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return lastSyncFormatter.format(date);
}

function buildHref(
  page: number,
  limit: number,
  filters: {
    q?: string;
    status?: LookupRecordStatus;
    sort?: string;
    sortDir?: string;
  } = {},
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  // Persist sort in the URL except the built-in default (Branch A→Z) so Clear
  // and first load stay on a clean path while still applying that order server-side.
  if (
    filters.sort &&
    (filters.sort !== FLAT_SERIAL_DEFAULT_SORT ||
      filters.sortDir !== FLAT_SERIAL_DEFAULT_SORT_DIR)
  ) {
    params.set("sort", filters.sort);
    if (filters.sortDir) params.set("dir", filters.sortDir);
  }
  const query = params.toString();
  return query ? `/inventory/serial-numbers?${query}` : "/inventory/serial-numbers";
}

export function SerialNumberTable({
  result,
  modelOptions,
  canManage,
  canSync,
  currentSearch,
  currentStatus,
  initialSort = FLAT_SERIAL_DEFAULT_SORT,
  initialSortDir = FLAT_SERIAL_DEFAULT_SORT_DIR,
}: SerialNumberTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentSearch ?? "");
  const [status, setStatus] = useState<string>(currentStatus ?? "");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formSerialNo, setFormSerialNo] = useState("");
  const [formModelId, setFormModelId] = useState("");
  const [pending, startTransition] = useTransition();
  const pageSize = parseTablePageSize(result.limit);
  const sort =
    (searchParams.get("sort") ?? initialSort) || FLAT_SERIAL_DEFAULT_SORT;
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "desc" ? "desc" : "asc"
  ) as FlatSerialSortDir;

  const rows = result.items;
  const indexOffset = (result.page - 1) * result.limit;
  const activeFilters = {
    q: currentSearch,
    status: currentStatus,
    sort,
    sortDir,
  };
  const hasActiveFilters = Boolean(currentSearch || currentStatus);
  const emptyMessage = hasActiveFilters
    ? "No serial numbers match your filters."
    : "No serial numbers yet.";

  const modelSelectOptions = useMemo(
    () =>
      modelOptions.map((model) => ({
        id: model.id,
        label: `${model.skuCode} — ${model.name}`,
      })),
    [modelOptions],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        result.items.map((row) => row.serialNo),
        result.items.map((row) => row.model.skuCode),
        result.items.map((row) => row.model.name),
        result.items.map((row) => row.branchCode),
        result.items.map((row) => row.branchName),
      ),
    [result.items],
  );

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(buildHref(1, limit, activeFilters));
  }

  function toggleSort(field: FlatSerialSortField) {
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

  function openEdit(serial: FlatSerialRow) {
    setEditingId(serial.id);
    setFormSerialNo(serial.serialNo);
    setFormModelId(serial.model.id);
    setOpen(true);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { serialNo: formSerialNo, modelId: formModelId };
    startTransition(async () => {
      const outcome = editingId
        ? await updateSerialNumberAction(editingId, payload)
        : await createSerialNumberAction(payload);
      if (outcome.error) {
        toast.error(outcome.error);
        return;
      }
      toast.success(editingId ? "Serial number updated" : "Serial number created");
      setOpen(false);
      router.refresh();
    });
  }

  function toggleStatus(serial: FlatSerialRow) {
    const next: LookupRecordStatus =
      serial.recordStatus === "active" ? "inactive" : "active";
    startTransition(async () => {
      const outcome = await setSerialNumberStatusAction(serial.id, {
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

  const columns = useMemo(() => {
    const cols: DataTableColumn<FlatSerialRow>[] = [
      serialColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      serialColumn.display({
        id: "serial",
        header: "Serial no",
        enableSorting: true,
        cell: ({ row }) => (
          <Link
            href={`/inventory/serial-numbers/${row.original.id}`}
            className="underline-offset-4 hover:underline"
          >
            {row.original.serialNo}
          </Link>
        ),
        meta: { className: "whitespace-nowrap font-mono text-sm" },
      }),
      serialColumn.display({
        id: "model",
        header: "SKU / model",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block font-mono text-sm font-medium">{row.original.model.skuCode}</span>
            <span className="block whitespace-normal wrap-break-word text-xs text-muted-foreground">
              {row.original.model.name}
            </span>
          </div>
        ),
        meta: { wrap: true },
      }),
      serialColumn.display({
        id: "branch",
        header: "Branch Name",
        enableSorting: true,
        cell: ({ row }) =>
          row.original.branchCode || row.original.branchName ? (
            <div className="min-w-0">
              {row.original.branchCode ? (
                <span className="block font-mono text-sm">{row.original.branchCode}</span>
              ) : null}
              {row.original.branchName ? (
                <span className="block whitespace-normal wrap-break-word text-xs text-muted-foreground">
                  {row.original.branchName}
                </span>
              ) : null}
            </div>
          ) : (
            "—"
          ),
        meta: { wrap: true },
      }),
      serialColumn.display({
        id: "qty",
        header: "Branch qty",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.branchQty == null ? "—" : row.original.branchQty.toLocaleString(),
        meta: { align: "end", className: "tabular-nums" },
      }),
      serialColumn.display({
        id: "status",
        header: "ISMS status",
        enableSorting: true,
        cell: ({ row }) =>
          row.original.statusCode ? (
            <StatusCodeBadge
              code={row.original.statusCode.code}
              name={row.original.statusCode.name}
              color={row.original.statusCode.color}
            />
          ) : (
            "—"
          ),
      }),
      serialColumn.display({
        id: "record",
        header: "Record",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant={row.original.recordStatus === "active" ? "default" : "secondary"}>
            {row.original.recordStatus === "active" ? "Active" : "Inactive"}
          </Badge>
        ),
      }),
      serialColumn.display({
        id: "lastSync",
        header: "Last sync",
        enableSorting: true,
        cell: ({ row }) => formatLastSync(row.original.lastSyncedAt),
        meta: { className: "whitespace-nowrap text-sm text-muted-foreground" },
      }),
    ];
    if (canManage) {
      cols.push(
        serialColumn.display({
          id: "actions",
          header: "Actions",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="flex justify-end gap-2 whitespace-nowrap">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => openEdit(row.original)}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => toggleStatus(row.original)}
              >
                {row.original.recordStatus === "active" ? "Deactivate" : "Activate"}
              </Button>
            </div>
          ),
          meta: { align: "end" },
        }),
      );
    }
    return cols;
  }, [canManage, indexOffset, pending]);

  return (
    <>
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        manualSorting
        manualPagination
        enableSorting
        sorting={{
          sortKey: sort,
          sortDir,
          onSort: (key) => toggleSort(key as FlatSerialSortField),
        }}
        stickyHeader
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Serial no, SKU, or model…",
          suggestions,
        }}
        toolbarActions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/inventory/serial-numbers?view=by-model">By model</Link>
            </Button>
            {canSync ? (
              <SapSyncButton
                syncKey="serial-number"
                noun={{ one: "serial number", many: "serial numbers" }}
                onSync={syncSerialNumbersFromSapAction}
              />
            ) : null}
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
            {/* DO NOT DELETE - SAP is the source of truth for serial numbers, so they
                are created only by the sync above. Restoring an Add serial button also
                needs the Plus icon import (lucide-react) and a create dialog. */}
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
        empty={rows.length === 0}
        emptyMessage={emptyMessage}
      />

      {canManage ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Edit serial number" : "Add serial number"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="serial-no">Serial number</Label>
                <Input
                  id="serial-no"
                  value={formSerialNo}
                  onChange={(event) => setFormSerialNo(event.target.value)}
                  className="font-mono"
                  required
                />
              </div>
              <SearchableSelect
                label="Model"
                id="serial-model"
                options={modelSelectOptions}
                value={formModelId}
                onChange={setFormModelId}
                placeholder="Select model…"
                searchPlaceholder="Search models…"
                disabled={pending}
              />
              <DialogFooter>
                <Button type="submit" disabled={pending || !formModelId}>
                  {editingId ? "Save changes" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
