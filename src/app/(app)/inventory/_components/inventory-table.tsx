"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import type { InventoryListItem } from "@/features/inventory/actions/inventory.actions";
import {
  STOCK_UNITS_DEFAULT_SORT,
  STOCK_UNITS_DEFAULT_SORT_DIR,
} from "@/features/inventory/constants/stock-units-sort";
import { formatInventoryDrDate } from "@/app/(app)/inventory/_components/inventory-list-format";
import {
  buildStockUnitsHref,
  stockUnitsHrefForView,
} from "@/app/(app)/inventory/_components/stock-units-url";
import { StockUnitsViewSwitch } from "@/app/(app)/inventory/_components/stock-units-view-switch";
import { InventoryUnitStatusCell } from "@/features/inventory/components/inventory-unit-status-cell";
import { TableIndexCell, TableIndexHead } from "@/components/data-table";
import {
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import { GlobalDataTable, GlobalTableHead, nextTableSort } from "@/lib/data-table";
import type { PaginatedResult } from "@/lib/shared/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchesTableSearch } from "@/utils/match-table-search";
import { cn } from "@/utils/cn";

type InventorySortField =
  | "branch"
  | "model"
  | "serial"
  | "dr"
  | "drDate"
  | "planogram"
  | "aging"
  | "status";
type InventorySortDir = "asc" | "desc";

interface InventoryTableProps {
  result: PaginatedResult<InventoryListItem>;
  initialOffPlanogram?: boolean;
  initialSort?: string;
  initialSortDir?: string;
  /** Hide branch search/column (PS stock units UX). */
  hideBranch?: boolean;
}

export function InventoryTable({
  result,
  initialOffPlanogram = false,
  initialSort = STOCK_UNITS_DEFAULT_SORT,
  initialSortDir = STOCK_UNITS_DEFAULT_SORT_DIR,
  hideBranch = false,
}: InventoryTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [offPlanogramOnly, setOffPlanogramOnly] = useState(initialOffPlanogram);
  const pageSize = parseTablePageSize(result.limit);

  const branchFilter = searchParams.get("branch") ?? "";
  const skuFilter = searchParams.get("sku") ?? "";
  const sort =
    (searchParams.get("sort") ?? initialSort) || STOCK_UNITS_DEFAULT_SORT;
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "desc" ? "desc" : "asc"
  ) as InventorySortDir;
  const urlFilters = {
    branch: branchFilter || undefined,
    sku: skuFilter || undefined,
  };

  function pushHref(overrides: {
    page?: number;
    limit?: number;
    offPlanogram?: boolean;
    sort?: string;
    sortDir?: string;
  } = {}) {
    router.push(
      buildStockUnitsHref({
        view: "all",
        page: overrides.page ?? 1,
        limit: overrides.limit ?? pageSize,
        offPlanogram: overrides.offPlanogram ?? offPlanogramOnly,
        sort: overrides.sort !== undefined ? overrides.sort : sort,
        sortDir: overrides.sortDir !== undefined ? overrides.sortDir : sortDir,
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

  function toggleSort(field: InventorySortField) {
    const next = nextTableSort(field, sort, sortDir);
    pushHref({ sort: next.sort, sortDir: next.dir, page: 1 });
  }

  const filterBanner =
    branchFilter || skuFilter ? (
      <div className="border-b px-4 py-2 text-sm text-muted-foreground">
        Filtered
        {branchFilter ? " · branch" : ""}
        {skuFilter ? ` · SKU ${skuFilter}` : ""}
        <Button variant="link" className="ml-2 h-auto p-0" asChild>
          <Link href={buildStockUnitsHref({ view: "all" })}>Clear</Link>
        </Button>
      </div>
    ) : null;

  const searchPlaceholder = hideBranch
    ? "Search serial, SKU…"
    : "Search serial, SKU, branch…";

  /**
   * Fixed layout: Branch Name + DR# wrap full text (no ellipsis truncate);
   * Model/Serial stay readable; rem tracks on the right stay steady.
   */
  const columnWidths = (
    <colgroup>
      <col className="w-10" />
      <col className="w-12" />
      {hideBranch ? null : <col className="w-[16rem]" />}
      <col className="w-[14rem]" />
      <col className="w-[14rem]" />
      <col className="w-[11rem]" />
      <col className="w-28" />
      <col className="w-36" />
      <col className="w-32" />
      <col className="w-44" />
    </colgroup>
  );

  const headCompact = "whitespace-nowrap px-3";
  const cellCompact = "px-3";

  return (
    <>
      <GlobalDataTable
        stickyHeader
        scrollable
        tableClassName="table-fixed"
        search={{
          value: query,
          onChange: setQuery,
          placeholder: searchPlaceholder,
          suggestions,
        }}
        toolbarLeading={
          <StockUnitsViewSwitch
            current="all"
            hrefForView={(view) =>
              stockUnitsHrefForView(view, {
                pageSize,
                offPlanogram: offPlanogramOnly,
                sort,
                sortDir,
                filters: urlFilters,
              })
            }
          />
        }
        toolbarActions={
          <>
            {selection.selectedCount > 0 ? (
              <Button variant="secondary" onClick={selection.clearSelection}>
                {selection.selectedCount} selected
              </Button>
            ) : null}
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
            buildStockUnitsHref({
              view: "all",
              page,
              limit: pageSize,
              offPlanogram: offPlanogramOnly,
              sort,
              sortDir,
              filters: urlFilters,
            }),
        }}
        footer={
          filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No inventory rows</p>
          ) : null
        }
      >
        {columnWidths}
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
            {hideBranch ? null : (
              <GlobalTableHead
                className="whitespace-normal"
                sortKey="branch"
                activeSortKey={sort}
                sortDirection={sortDir}
                onSort={(key) => toggleSort(key as InventorySortField)}
              >
                Branch Name
              </GlobalTableHead>
            )}
            <GlobalTableHead
              className="whitespace-normal"
              sortKey="model"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as InventorySortField)}
            >
              Model
            </GlobalTableHead>
            <GlobalTableHead
              className="whitespace-nowrap"
              sortKey="serial"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as InventorySortField)}
            >
              Serial
            </GlobalTableHead>
            <GlobalTableHead
              className={headCompact}
              sortKey="dr"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as InventorySortField)}
            >
              DR#
            </GlobalTableHead>
            <GlobalTableHead
              className={headCompact}
              sortKey="drDate"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as InventorySortField)}
            >
              DR DATE
            </GlobalTableHead>
            <GlobalTableHead
              className={headCompact}
              sortKey="planogram"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as InventorySortField)}
            >
              Planogram
            </GlobalTableHead>
            <GlobalTableHead
              className={cn(
                headCompact,
                "text-center [&_button]:mx-auto [&_button]:justify-center",
              )}
              sortKey="aging"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as InventorySortField)}
            >
              Aging in days
            </GlobalTableHead>
            <GlobalTableHead
              className={headCompact}
              sortKey="status"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as InventorySortField)}
            >
              Status
            </GlobalTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r, index) => (
            <TableRow
              key={r.id}
              data-state={selection.isRowSelected(r.id) ? "selected" : undefined}
            >
              <TableCell className="w-10">
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
                <TableCell
                  className="min-w-0 whitespace-normal break-words wrap-break-word px-2 text-sm"
                  title={r.branch.name}
                >
                  {r.branch.name}
                </TableCell>
              )}
              <TableCell className="min-w-0 px-2">
                <span className="block whitespace-normal break-words wrap-break-word font-mono text-sm">
                  {r.serialNumber.model.sku}
                </span>
                <span className="block whitespace-normal break-words wrap-break-word text-xs text-muted-foreground">
                  {r.serialNumber.model.name}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap px-2 font-mono text-sm">
                {r.serialNumber.serialNo}
              </TableCell>
              <TableCell
                className={cn(
                  cellCompact,
                  "min-w-0 whitespace-normal break-words wrap-break-word font-mono text-sm",
                )}
                title={r.deliveryNo?.trim() || undefined}
              >
                {r.deliveryNo?.trim() || "—"}
              </TableCell>
              <TableCell
                className={cn(
                  cellCompact,
                  "min-w-0 whitespace-nowrap tabular-nums text-sm",
                )}
              >
                {formatInventoryDrDate(r.deliveryDate)}
              </TableCell>
              <TableCell className={cn(cellCompact, "min-w-0")}>
                {r.onPlanogram ? (
                  <Badge
                    variant="outline"
                    className="whitespace-nowrap border-green-600 text-green-700"
                  >
                    On planogram
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="whitespace-nowrap border-amber-600 text-amber-700"
                  >
                    Off planogram
                  </Badge>
                )}
              </TableCell>
              <TableCell
                className={cn(cellCompact, "text-center tabular-nums")}
              >
                {r.agingDays}
              </TableCell>
              <TableCell className={cn(cellCompact, "min-w-0")}>
                <InventoryUnitStatusCell row={r} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </GlobalDataTable>
    </>
  );
}
