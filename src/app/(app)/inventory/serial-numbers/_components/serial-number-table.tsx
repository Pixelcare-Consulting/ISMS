"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import type { LookupRecordStatus } from "@prisma/client";

import {
  ModelSerialsPanel,
  type ModelSerialPageState,
  type ModelSerialPanelRow,
} from "@/app/(app)/inventory/serial-numbers/_components/model-serials-panel";
import {
  createSerialNumberAction,
  listModelBranchSerialsAction,
  setSerialNumberStatusAction,
  syncSerialNumbersFromSapAction,
  updateSerialNumberAction,
} from "@/features/serial-numbers/actions/serial-number.actions";
import { SapSyncButton } from "@/features/sap/components/sap-sync-button";
import {
  TableEmptyRow,
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
import { cn } from "@/utils/cn";

interface SerialModelOption {
  id: string;
  skuCode: string;
  name: string;
}

interface SerialModelRow {
  id: string;
  skuCode: string;
  name: string;
  brand: { name: string } | null;
  lastSyncedAt?: Date | string | null;
  /**
   * Units SAP still has on hand. Null until an on-hand read has included this model,
   * which the Qty column shows as an em dash.
   */
  sapOnHand?: number | null;
}

interface SerialNumberTableProps {
  result: {
    items: SerialModelRow[];
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

type SerialNumberSortField = "model";
type SerialNumberSortDir = "asc" | "desc";

const COL_COUNT = 4;

const lastSyncFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatOnHandQty(value: number | null | undefined): string {
  if (typeof value !== "number") return "—";
  return value.toLocaleString();
}

function formatLastSync(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return lastSyncFormatter.format(date);
}

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
  canSync,
  currentSearch,
  currentStatus,
  initialSort = "",
  initialSortDir = "asc",
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
  const [, startSerialLoad] = useTransition();
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const serialPageRef = useRef<Record<string, number>>({});
  const serialQueryRef = useRef<Record<string, string>>({});
  const [serialsByModel, setSerialsByModel] = useState<
    Record<string, ModelSerialPageState | "loading">
  >({});
  const pageSize = parseTablePageSize(result.limit);
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "desc" ? "desc" : "asc"
  ) as SerialNumberSortDir;

  const rows = result.items;
  const activeFilters = {
    q: currentSearch,
    status: currentStatus,
    sort: sort || undefined,
    sortDir: sort ? sortDir : undefined,
  };
  const hasActiveFilters = Boolean(currentSearch || currentStatus);
  const emptyMessage = hasActiveFilters
    ? "No models match your filters."
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
        result.items.map((row) => row.skuCode),
        result.items.map((row) => row.name),
      ),
    [result.items],
  );

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

  async function loadSerials(modelId: string, page = 1, query?: string) {
    const term = (query !== undefined ? query : serialQueryRef.current[modelId] ?? "").trim();
    serialQueryRef.current[modelId] = term;
    let hadPage = false;
    setSerialsByModel((current) => {
      const existing = current[modelId];
      if (existing && existing !== "loading") {
        hadPage = true;
        return { ...current, [modelId]: { ...existing, loading: true } };
      }
      return { ...current, [modelId]: "loading" };
    });
    const outcome = await listModelBranchSerialsAction(modelId, page, term || undefined);
    if ("error" in outcome) {
      toast.error(outcome.error);
      setSerialsByModel((current) => {
        const existing = current[modelId];
        if (existing && existing !== "loading") {
          return { ...current, [modelId]: { ...existing, loading: false } };
        }
        const next = { ...current };
        delete next[modelId];
        return next;
      });
      if (!hadPage) {
        setExpandedModelId((current) => (current === modelId ? null : current));
      }
      return;
    }
    serialPageRef.current[modelId] = outcome.page;
    setSerialsByModel((current) => ({
      ...current,
      [modelId]: {
        items: outcome.items,
        total: outcome.total,
        page: outcome.page,
        totalPages: outcome.totalPages,
        onHandRecorded: outcome.onHandRecorded,
      },
    }));
  }

  function toggleSerials(row: SerialModelRow) {
    if (expandedModelId === row.id) {
      setExpandedModelId(null);
      return;
    }
    setExpandedModelId(row.id);
    if (serialsByModel[row.id] && serialsByModel[row.id] !== "loading") return;
    startSerialLoad(() => loadSerials(row.id));
  }

  function openEdit(modelId: string, serial: ModelSerialPanelRow) {
    setEditingId(serial.id);
    setFormSerialNo(serial.serialNo);
    setFormModelId(modelId);
    setOpen(true);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { serialNo: formSerialNo, modelId: formModelId };
    const modelId = expandedModelId;
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
      if (modelId) await loadSerials(modelId, serialPageRef.current[modelId] ?? 1);
      router.refresh();
    });
  }

  function toggleStatus(modelId: string, serial: ModelSerialPanelRow) {
    const next: LookupRecordStatus = serial.recordStatus === "active" ? "inactive" : "active";
    startTransition(async () => {
      const outcome = await setSerialNumberStatusAction(serial.id, { recordStatus: next });
      if (outcome.error) {
        toast.error(outcome.error);
        return;
      }
      toast.success(next === "active" ? "Serial activated" : "Serial deactivated");
      setSerialsByModel((current) => {
        const list = current[modelId];
        if (!list || list === "loading") return current;
        return {
          ...current,
          [modelId]: {
            ...list,
            items: list.items.map((row) =>
              row.id === serial.id ? { ...row, recordStatus: next } : row,
            ),
          },
        };
      });
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
          itemLabel: "model",
          buildHref: (page) => buildHref(page, pageSize, activeFilters),
        }}
      >
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableIndexHead />
            <GlobalTableHead
              sortKey="model"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as SerialNumberSortField)}
            >
              SKU / model
            </GlobalTableHead>
            <GlobalTableHead>Qty</GlobalTableHead>
            <GlobalTableHead>Last sync</GlobalTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableEmptyRow colSpan={COL_COUNT} message={emptyMessage} />
          ) : (
            rows.map((row, index) => {
              const expanded = expandedModelId === row.id;
              const onHandRecorded = typeof row.sapOnHand === "number";
              return (
                <Fragment key={row.id}>
                  <TableRow className={cn(index % 2 === 1 && "bg-table-stripe")}>
                    <TableIndexCell index={(result.page - 1) * result.limit + index + 1} />
                    <TableCell>
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="font-medium">{row.skuCode}</span>
                        <span className="truncate text-sm text-muted-foreground">{row.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-expanded={expanded}
                        title={
                          onHandRecorded
                            ? "Units SAP still has on hand"
                            : "On-hand stock has not been recorded yet in ISMS, sync from SAP first for this model"
                        }
                        className="h-auto px-2 text-sm font-medium tabular-nums"
                        onClick={() => toggleSerials(row)}
                      >
                        {formatOnHandQty(row.sapOnHand)}
                      </Button>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatLastSync(row.lastSyncedAt)}
                    </TableCell>
                  </TableRow>
                  {expanded ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={COL_COUNT} className="p-2 sm:p-3">
                        <ModelSerialsPanel
                          skuCode={row.skuCode}
                          modelName={row.name}
                          page={serialsByModel[row.id]}
                          canManage={canManage}
                          pending={pending}
                          onPageChange={(page) => startSerialLoad(() => loadSerials(row.id, page))}
                          onSearch={(query) => startSerialLoad(() => loadSerials(row.id, 1, query))}
                          onEdit={(serial) => openEdit(row.id, serial)}
                          onToggleStatus={(serial) => toggleStatus(row.id, serial)}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </GlobalDataTable>

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
