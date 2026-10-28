"use client";

import type { RowSelectionState } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { createInventorySerialColumns } from "@/app/(app)/inventory/_components/inventory-serial-columns";
import {
  buildStockUnitsHref,
  stockUnitsHrefForView,
} from "@/app/(app)/inventory/_components/stock-units-url";
import { StockUnitsViewSwitch } from "@/app/(app)/inventory/_components/stock-units-view-switch";
import type { InventoryListItem } from "@/features/inventory/actions/inventory.actions";
import {
  STOCK_UNITS_DEFAULT_SORT,
  STOCK_UNITS_DEFAULT_SORT_DIR,
} from "@/features/inventory/constants/stock-units-sort";
import { SerialSapSyncDialog } from "@/features/serial-numbers/components/serial-sap-sync-dialog";
import {
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DataTable, nextTableSort } from "@/lib/data-table";
import type { PaginatedResult } from "@/lib/shared/pagination";
import { matchesTableSearch } from "@/utils/match-table-search";

type InventorySortDir = "asc" | "desc";

interface InventoryTableProps {
  result: PaginatedResult<InventoryListItem>;
  initialOffPlanogram?: boolean;
  initialSort?: string;
  initialSortDir?: string;
  /** Hide branch search/column (PS stock units UX). */
  hideBranch?: boolean;
  /** Serial sync from SAP — requires `sap.manage`. */
  canSync?: boolean;
}

export function InventoryTable({
  result,
  initialOffPlanogram = false,
  initialSort = STOCK_UNITS_DEFAULT_SORT,
  initialSortDir = STOCK_UNITS_DEFAULT_SORT_DIR,
  hideBranch = false,
  canSync = false,
}: InventoryTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [offPlanogramOnly, setOffPlanogramOnly] = useState(initialOffPlanogram);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
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
      result.items.filter((row) =>
        matchesTableSearch(query, [
          row.serialNumber.serialNo,
          row.serialNumber.model.sku,
          ...(hideBranch ? [] : [row.branch.name]),
          row.statusCode.name,
          row.statusCode.code,
          row.deliveryNo ?? "",
        ]),
      ),
    [result.items, query, hideBranch],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        result.items.map((row) => row.serialNumber.serialNo),
        result.items.map((row) => row.serialNumber.model.sku),
        ...(hideBranch ? [] : [result.items.map((row) => row.branch.name)]),
        result.items.map((row) => row.statusCode.name),
        result.items.map((row) => row.statusCode.code),
        result.items.map((row) => row.deliveryNo),
      ),
    [result.items, hideBranch],
  );

  const getSelectionLabel = useCallback(
    (row: InventoryListItem) => `Select serial ${row.serialNumber.serialNo}`,
    [],
  );

  const selectedCount = filtered.reduce(
    (count, row) => count + (rowSelection[row.id] ? 1 : 0),
    0,
  );

  function toggleOffPlanogram(checked: boolean) {
    setOffPlanogramOnly(checked);
    pushHref({ offPlanogram: checked, page: 1 });
  }

  function toggleSort(field: string) {
    const next = nextTableSort(field, sort, sortDir);
    pushHref({ sort: next.sort, sortDir: next.dir, page: 1 });
  }

  const indexOffset = (result.page - 1) * result.limit;
  const columns = useMemo(
    () =>
      createInventorySerialColumns({
        indexOffset,
        includeBranch: !hideBranch,
        includeModel: true,
        sortable: true,
        agingHeader: "Aging in days",
      }),
    [hideBranch, indexOffset],
  );

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

  return (
    <DataTable
      data={filtered}
      columns={columns}
      getRowId={(row) => row.id}
      manualSorting
      manualPagination
      enableSorting
      sorting={{ sortKey: sort, sortDir, onSort: toggleSort }}
      enableRowSelection
      rowSelection={rowSelection}
      onRowSelectionChange={setRowSelection}
      selectAllLabel="Select all inventory rows"
      getSelectionLabel={getSelectionLabel}
      stickyHeader
      search={{
        value: query,
        onChange: setQuery,
        placeholder: hideBranch ? "Search serial, SKU…" : "Search serial, SKU, branch…",
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
          {canSync ? <SerialSapSyncDialog /> : null}
          {selectedCount > 0 ? (
            <Button variant="secondary" className="min-h-11" onClick={() => setRowSelection({})}>
              {selectedCount} selected
            </Button>
          ) : null}
          <div className="flex items-center gap-2 text-sm">
            <input
              id="off-planogram"
              type="checkbox"
              checked={offPlanogramOnly}
              onChange={(event) => toggleOffPlanogram(event.target.checked)}
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
    />
  );
}
