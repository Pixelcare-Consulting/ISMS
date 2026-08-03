"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { updateInventoryStatusAction } from "@/features/inventory/actions/inventory.actions";
import type {
  InventoryListItem,
  InventoryStatusOption,
} from "@/features/inventory/actions/inventory.actions";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { TableIndexCell, TableIndexHead } from "@/components/data-table";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import { GlobalDataTable, GlobalTableHead } from "@/lib/data-table";
import type { PaginatedResult } from "@/lib/shared/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchesTableSearch } from "@/utils/match-table-search";
import { cn } from "@/utils/cn";

type InventorySortField = "aging" | "dr";
type InventorySortDir = "asc" | "desc";

interface InventoryTableProps {
  result: PaginatedResult<InventoryListItem>;
  statusOptions: InventoryStatusOption[];
  initialOffPlanogram?: boolean;
  initialStatusCodeId?: string;
  initialSort?: string;
  initialSortDir?: string;
  /** Hide branch search/column (PS stock units UX). */
  hideBranch?: boolean;
}

function buildInventoryHref(opts: {
  page: number;
  limit: number;
  offPlanogram: boolean;
  statusCodeId?: string;
  sort?: string;
  sortDir?: string;
  filters?: { branch?: string; sku?: string };
}): string {
  const params = new URLSearchParams();
  if (opts.page > 1) params.set("page", String(opts.page));
  if (opts.limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(opts.limit));
  if (opts.offPlanogram) params.set("offPlanogram", "1");
  if (opts.statusCodeId) params.set("status", opts.statusCodeId);
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.sortDir) params.set("dir", opts.sortDir);
  if (opts.filters?.branch) params.set("branch", opts.filters.branch);
  if (opts.filters?.sku) params.set("sku", opts.filters.sku);
  const qs = params.toString();
  return qs ? `/inventory?${qs}` : "/inventory";
}

function formatDrDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function sortIndicator(
  field: InventorySortField,
  currentSort: string,
  currentDir: InventorySortDir,
): string {
  if (currentSort !== field) return "";
  return currentDir === "asc" ? " ↑" : " ↓";
}

export function InventoryTable({
  result,
  statusOptions,
  initialOffPlanogram = false,
  initialStatusCodeId = "",
  initialSort = "",
  initialSortDir = "desc",
  hideBranch = false,
}: InventoryTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [offPlanogramOnly, setOffPlanogramOnly] = useState(initialOffPlanogram);
  const [statusCodeId, setStatusCodeId] = useState(initialStatusCodeId);
  const [pending, startTransition] = useTransition();
  const pageSize = parseTablePageSize(result.limit);

  const branchFilter = searchParams.get("branch") ?? "";
  const skuFilter = searchParams.get("sku") ?? "";
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as InventorySortDir;
  const urlFilters = {
    branch: branchFilter || undefined,
    sku: skuFilter || undefined,
  };

  function pushHref(overrides: {
    page?: number;
    limit?: number;
    offPlanogram?: boolean;
    statusCodeId?: string;
    sort?: string;
    sortDir?: string;
  } = {}) {
    router.push(
      buildInventoryHref({
        page: overrides.page ?? 1,
        limit: overrides.limit ?? pageSize,
        offPlanogram: overrides.offPlanogram ?? offPlanogramOnly,
        statusCodeId:
          overrides.statusCodeId !== undefined
            ? overrides.statusCodeId || undefined
            : statusCodeId || undefined,
        sort: overrides.sort !== undefined ? overrides.sort || undefined : sort || undefined,
        sortDir:
          overrides.sortDir !== undefined
            ? overrides.sortDir || undefined
            : sort
              ? sortDir
              : undefined,
        filters: urlFilters,
      }),
    );
  }

  function handlePageSizeChange(limit: TablePageSize) {
    pushHref({ page: 1, limit });
  }

  const filtered = useMemo(
    () =>
      result.items.filter((r) =>
        matchesTableSearch(
          query,
          [
            r.serialNumber.serialNo,
            r.serialNumber.model.sku,
            ...(hideBranch ? [] : [r.branch.name]),
            r.statusCode.name,
            r.statusCode.code,
            r.deliveryNo ?? "",
          ],
        ),
      ),
    [result.items, query, hideBranch],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        result.items.map((r) => r.serialNumber.serialNo),
        result.items.map((r) => r.serialNumber.model.sku),
        ...(hideBranch ? [] : [result.items.map((r) => r.branch.name)]),
        result.items.map((r) => r.statusCode.name),
        result.items.map((r) => r.statusCode.code),
        result.items.map((r) => r.deliveryNo),
      ),
    [result.items, hideBranch],
  );

  const selection = useTableSelection(filtered.map((r) => r.id));

  function toggleOffPlanogram(checked: boolean) {
    setOffPlanogramOnly(checked);
    pushHref({ offPlanogram: checked, page: 1 });
  }

  function changeStatusFilter(next: string) {
    setStatusCodeId(next);
    pushHref({ statusCodeId: next, page: 1 });
  }

  function toggleSort(field: InventorySortField) {
    if (sort === field) {
      pushHref({
        sort: field,
        sortDir: sortDir === "asc" ? "desc" : "asc",
        page: 1,
      });
      return;
    }
    pushHref({ sort: field, sortDir: "desc", page: 1 });
  }

  function changeStatus(id: string, nextStatusCodeId: string) {
    startTransition(async () => {
      const updateResult = await updateInventoryStatusAction(id, nextStatusCodeId);
      if (updateResult.error) {
        toast.error("Could not update status");
        return;
      }
      toast.success("Status updated");
      router.refresh();
    });
  }

  function openSerialDetail(serialNumberId: string) {
    router.push(`/inventory/serial-numbers/${serialNumberId}`);
  }

  const filterBanner =
    branchFilter || skuFilter || statusCodeId ? (
      <div className="border-b px-4 py-2 text-sm text-muted-foreground">
        Filtered
        {branchFilter ? " · branch" : ""}
        {skuFilter ? ` · SKU ${skuFilter}` : ""}
        {statusCodeId
          ? ` · status ${
              statusOptions.find((s) => s.id === statusCodeId)?.code ?? ""
            }`
          : ""}
        <Button variant="link" className="ml-2 h-auto p-0" asChild>
          <Link href="/inventory">Clear</Link>
        </Button>
      </div>
    ) : null;

  const searchPlaceholder = hideBranch
    ? "Search serial, SKU…"
    : "Search serial, SKU, branch…";

  return (
    <>
      <GlobalDataTable
        stickyHeader
        scrollable
        search={{
          value: query,
          onChange: setQuery,
          placeholder: searchPlaceholder,
          suggestions,
        }}
        toolbarActions={
          <>
            {selection.selectedCount > 0 ? (
              <Button variant="secondary" onClick={selection.clearSelection}>
                {selection.selectedCount} selected
              </Button>
            ) : null}
            <div className="w-44">
              <SearchableSelect
                options={statusOptions.map((s) => ({
                  id: s.id,
                  label: `${s.name} (${s.code})`,
                }))}
                value={statusCodeId}
                allowClear
                placeholder="All statuses"
                searchPlaceholder="Filter status…"
                onChange={changeStatusFilter}
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input
                id="off-planogram"
                type="checkbox"
                checked={offPlanogramOnly}
                onChange={(e) => toggleOffPlanogram(e.target.checked)}
              />
              <Label htmlFor="off-planogram" className="font-normal">
                Off-planogram only
              </Label>
            </div>
          </>
        }
        banner={filterBanner}
        pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
        pagination={{
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          itemLabel: "unit",
          buildHref: (page) =>
            buildInventoryHref({
              page,
              limit: pageSize,
              offPlanogram: offPlanogramOnly,
              statusCodeId: statusCodeId || undefined,
              sort: sort || undefined,
              sortDir: sort ? sortDir : undefined,
              filters: urlFilters,
            }),
        }}
        footer={
          filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No inventory rows</p>
          ) : null
        }
      >
        <TableHeader>
          <TableRow>
            <GlobalTableHead className="w-10">
              <Checkbox
                checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                aria-label="Select all inventory rows"
              />
            </GlobalTableHead>
            <TableIndexHead />
            {hideBranch ? null : <GlobalTableHead>Branch</GlobalTableHead>}
            <GlobalTableHead>Model</GlobalTableHead>
            <GlobalTableHead>Serial</GlobalTableHead>
            <GlobalTableHead>
              <button
                type="button"
                className="inline-flex items-center gap-1 font-medium hover:underline"
                onClick={() => toggleSort("dr")}
              >
                DR#{sortIndicator("dr", sort, sortDir)}
              </button>
            </GlobalTableHead>
            <GlobalTableHead>DR DATE</GlobalTableHead>
            <GlobalTableHead>Planogram</GlobalTableHead>
            <GlobalTableHead>
              <button
                type="button"
                className="inline-flex items-center gap-1 font-medium hover:underline"
                onClick={() => toggleSort("aging")}
              >
                Aging in days{sortIndicator("aging", sort, sortDir)}
              </button>
            </GlobalTableHead>
            <GlobalTableHead>Status</GlobalTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r, index) => (
            <TableRow
              key={r.id}
              data-state={selection.isRowSelected(r.id) ? "selected" : undefined}
              className="cursor-pointer"
              onClick={() => openSerialDetail(r.serialNumber.id)}
            >
              <TableCell
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={selection.isRowSelected(r.id)}
                  onCheckedChange={(checked) => selection.toggleRow(r.id, checked === true)}
                  aria-label={`Select serial ${r.serialNumber.serialNo}`}
                />
              </TableCell>
              <TableIndexCell
                index={(result.page - 1) * result.limit + index + 1}
              />
              {hideBranch ? null : (
                <TableCell>{r.branch.name}</TableCell>
              )}
              <TableCell>
                <span className="font-mono text-sm">{r.serialNumber.model.sku}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.serialNumber.model.name}
                </span>
              </TableCell>
              <TableCell className="font-mono text-sm">{r.serialNumber.serialNo}</TableCell>
              <TableCell className="font-mono text-sm">{r.deliveryNo ?? "—"}</TableCell>
              <TableCell className="tabular-nums text-sm">
                {formatDrDate(r.deliveryDate)}
              </TableCell>
              <TableCell>
                {r.onPlanogram ? (
                  <Badge variant="outline" className="border-green-600 text-green-700">
                    On planogram
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-600 text-amber-700">
                    Off planogram
                  </Badge>
                )}
              </TableCell>
              <TableCell className="tabular-nums">{r.agingDays}</TableCell>
              <TableCell
                onClick={(e) => e.stopPropagation()}
                className={cn(pending && "opacity-70")}
              >
                <SearchableSelect
                  className="min-w-[10rem]"
                  options={statusOptions.map((s) => ({
                    id: s.id,
                    label: `${s.name} (${s.code})`,
                  }))}
                  value={r.statusCode.id}
                  disabled={pending}
                  searchPlaceholder="Search status…"
                  onChange={(next) => changeStatus(r.id, next)}
                />
                <div className="mt-1">
                  <StatusCodeBadge
                    code={r.statusCode.code}
                    name={r.statusCode.name}
                    showCode
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </GlobalDataTable>
    </>
  );
}
