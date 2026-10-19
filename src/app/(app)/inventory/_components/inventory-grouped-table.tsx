"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { InventoryGroupCounts } from "@/app/(app)/inventory/_components/inventory-group-counts";
import { createInventorySerialColumns } from "@/app/(app)/inventory/_components/inventory-serial-columns";
import {
  buildStockUnitsHref,
  stockUnitsHrefForView,
} from "@/app/(app)/inventory/_components/stock-units-url";
import { StockUnitsViewSwitch } from "@/app/(app)/inventory/_components/stock-units-view-switch";
import {
  listInventoryGroupChildrenAction,
  type InventoryGroupBranchInModelItemDto,
  type InventoryGroupBranchItemDto,
  type InventoryGroupModelItemDto,
  type InventoryListItem,
} from "@/features/inventory/actions/inventory.actions";
import type { StockUnitsGroupBy } from "@/features/inventory/constants/stock-units-group";
import type { StockUnitsView } from "@/features/inventory/constants/stock-units-view";
import {
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { TablePagination } from "@/components/data-table/table-pagination";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import type { PaginatedResult } from "@/lib/shared/pagination";
import { cn } from "@/utils/cn";

type GroupTopItem = InventoryGroupBranchItemDto | InventoryGroupModelItemDto;
type GroupMidItem = InventoryGroupModelItemDto | InventoryGroupBranchInModelItemDto;

type PaginatedSlice<T> = {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  loading: boolean;
  error: string | null;
};

const groupHelper = createColumnHelper<DataTableFeatures, GroupTopItem>();

function emptySlice(limit: number): PaginatedSlice<never> {
  return {
    items: [],
    total: 0,
    page: 1,
    totalPages: 1,
    limit,
    loading: false,
    error: null,
  };
}

function cacheKey(parts: (string | number | undefined | null)[]): string {
  return parts.filter((part) => part !== undefined && part !== null && part !== "").join(":");
}

function listFiltersCacheSuffix(filters: {
  branchIdFilter?: string;
  sku?: string;
  offPlanogram: boolean;
  q?: string;
}): string {
  return [
    filters.branchIdFilter ?? "",
    filters.sku ?? "",
    filters.offPlanogram ? "1" : "0",
    filters.q ?? "",
  ].join("|");
}

function topIdOf(groupBy: StockUnitsGroupBy, row: GroupTopItem): string {
  switch (groupBy) {
    case "by-branch":
      return (row as InventoryGroupBranchItemDto).branch.id;
    case "by-model":
      return (row as InventoryGroupModelItemDto).model.id;
    default: {
      const exhaustive: never = groupBy;
      return exhaustive;
    }
  }
}

interface InventoryGroupedTableProps {
  groupBy: StockUnitsGroupBy;
  result: PaginatedResult<GroupTopItem>;
  initialOffPlanogram?: boolean;
  initialSearch?: string;
  hideBranch?: boolean;
}

export function InventoryGroupedTable({
  groupBy,
  result,
  initialOffPlanogram = false,
  initialSearch = "",
  hideBranch = false,
}: InventoryGroupedTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [offPlanogramOnly, setOffPlanogramOnly] = useState(initialOffPlanogram);
  const [searchDraft, setSearchDraft] = useState(initialSearch);
  const pageSize = parseTablePageSize(result.limit);

  const branchFilter = searchParams.get("branch") ?? "";
  const skuFilter = searchParams.get("sku") ?? "";
  const appliedSearch = searchParams.get("q") ?? "";
  const urlFilters = {
    branch: branchFilter || undefined,
    sku: skuFilter || undefined,
  };

  const listFilters = useMemo(
    () => ({
      branchIdFilter: branchFilter || undefined,
      sku: skuFilter || undefined,
      offPlanogram: offPlanogramOnly,
      q: appliedSearch || undefined,
    }),
    [branchFilter, skuFilter, offPlanogramOnly, appliedSearch],
  );

  const [expandedTopId, setExpandedTopId] = useState<string | null>(null);
  const [expandedMidId, setExpandedMidId] = useState<string | null>(null);
  const [midPageByTop, setMidPageByTop] = useState<Record<string, number>>({});
  const [serialPageByPair, setSerialPageByPair] = useState<Record<string, number>>({});

  const [midCache, setMidCache] = useState<
    Map<string, PaginatedSlice<GroupMidItem>>
  >(() => new Map());

  const [serialCache, setSerialCache] = useState<
    Map<string, PaginatedSlice<InventoryListItem>>
  >(() => new Map());

  const currentView: StockUnitsView = groupBy;

  function pushHref(overrides: {
    page?: number;
    limit?: number;
    offPlanogram?: boolean;
    q?: string;
  } = {}) {
    router.push(
      buildStockUnitsHref({
        view: currentView,
        page: overrides.page ?? 1,
        limit: overrides.limit ?? pageSize,
        offPlanogram: overrides.offPlanogram ?? offPlanogramOnly,
        q: overrides.q !== undefined ? overrides.q : appliedSearch,
        filters: urlFilters,
      }),
    );
  }

  function handlePageSizeChange(limit: TablePageSize) {
    pushHref({ page: 1, limit });
  }

  function toggleOffPlanogram(checked: boolean) {
    setOffPlanogramOnly(checked);
    pushHref({ offPlanogram: checked, page: 1 });
  }

  function applySearch() {
    pushHref({ q: searchDraft.trim(), page: 1 });
  }

  const filterSuffix = listFiltersCacheSuffix(listFilters);
  const midLabel = groupBy === "by-branch" ? "Models" : "Branches";
  const midError = groupBy === "by-branch"
    ? "Could not load models"
    : "Could not load branches";

  const loadMidLevel = useCallback(
    async (topId: string, page = 1) => {
      const key = cacheKey(["mid", groupBy, topId, page, pageSize, filterSuffix]);
      setMidCache((prev) => {
        const next = new Map(prev);
        const existing = next.get(key) ?? emptySlice(pageSize);
        next.set(key, { ...existing, loading: true, error: null });
        return next;
      });

      try {
        const response =
          groupBy === "by-branch"
            ? await listInventoryGroupChildrenAction({
                groupBy,
                level: "models",
                branchId: topId,
                page,
                limit: pageSize,
                ...listFilters,
              })
            : await listInventoryGroupChildrenAction({
                groupBy,
                level: "branches",
                modelId: topId,
                page,
                limit: pageSize,
                ...listFilters,
              });

        setMidCache((prev) => {
          const next = new Map(prev);
          next.set(key, {
            items: response.items as GroupMidItem[],
            total: response.total,
            page: response.page,
            totalPages: response.totalPages,
            limit: response.limit,
            loading: false,
            error: null,
          });
          return next;
        });
      } catch {
        setMidCache((prev) => {
          const next = new Map(prev);
          next.set(key, { ...emptySlice(pageSize), error: midError });
          return next;
        });
      }
    },
    [filterSuffix, groupBy, listFilters, midError, pageSize],
  );

  const loadSerials = useCallback(
    async (branchId: string, modelId: string, page = 1) => {
      const key = cacheKey([
        "serial",
        groupBy,
        branchId,
        modelId,
        page,
        pageSize,
        filterSuffix,
      ]);
      setSerialCache((prev) => {
        const next = new Map(prev);
        const existing = next.get(key) ?? emptySlice(pageSize);
        next.set(key, { ...existing, loading: true, error: null });
        return next;
      });

      try {
        const response = await listInventoryGroupChildrenAction({
          groupBy,
          level: "serials",
          branchId,
          modelId,
          page,
          limit: pageSize,
          ...listFilters,
        });

        setSerialCache((prev) => {
          const next = new Map(prev);
          next.set(key, {
            items: response.items as InventoryListItem[],
            total: response.total,
            page: response.page,
            totalPages: response.totalPages,
            limit: response.limit,
            loading: false,
            error: null,
          });
          return next;
        });
      } catch {
        setSerialCache((prev) => {
          const next = new Map(prev);
          next.set(key, {
            ...emptySlice(pageSize),
            error: "Could not load serial numbers",
          });
          return next;
        });
      }
    },
    [filterSuffix, groupBy, listFilters, pageSize],
  );

  function resolveBranchModelIds(
    topId: string,
    midItem: GroupMidItem,
  ): { branchId: string; modelId: string; midKey: string } {
    if (groupBy === "by-branch") {
      const model = midItem as InventoryGroupModelItemDto;
      return {
        branchId: topId,
        modelId: model.model.id,
        midKey: model.model.id,
      };
    }
    const branch = midItem as InventoryGroupBranchInModelItemDto;
    return {
      branchId: branch.branch.id,
      modelId: topId,
      midKey: branch.branch.id,
    };
  }

  const midKeyForTop = useCallback(
    (topId: string, page: number) =>
      cacheKey(["mid", groupBy, topId, page, pageSize, filterSuffix]),
    [filterSuffix, groupBy, pageSize],
  );

  const serialKey = useCallback(
    (branchId: string, modelId: string, page: number) =>
      cacheKey(["serial", groupBy, branchId, modelId, page, pageSize, filterSuffix]),
    [filterSuffix, groupBy, pageSize],
  );

  const indexOffset = (result.page - 1) * result.limit;
  const topLabel = groupBy === "by-branch" ? "Branch" : "Model";

  const columns = useMemo(
    () => createGroupColumns(groupBy, topLabel, indexOffset),
    [groupBy, indexOffset, topLabel],
  );

  const getExpandLabel = useCallback((row: GroupTopItem, open: boolean) => {
    const name = groupTitleText(groupBy, row);
    return open ? `Collapse ${name}` : `Expand ${name}`;
  }, [groupBy]);

  function handleExpandedRowIds(ids: string[]) {
    const nextId = ids.length === 0 ? null : (ids[ids.length - 1] ?? null);
    if (nextId === expandedTopId) return;
    setExpandedTopId(nextId);
    setExpandedMidId(null);
    if (!nextId) return;
    setMidPageByTop((prev) => ({ ...prev, [nextId]: 1 }));
    void loadMidLevel(nextId, 1);
  }

  const filterBanner =
    branchFilter || skuFilter ? (
      <div className="border-b px-4 py-2 text-sm text-muted-foreground">
        Filtered
        {branchFilter ? " · branch" : ""}
        {skuFilter ? ` · SKU ${skuFilter}` : ""}
        <Button variant="link" className="ml-2 h-auto p-0" asChild>
          <Link
            href={buildStockUnitsHref({
              view: currentView,
              offPlanogram: offPlanogramOnly,
              q: appliedSearch,
            })}
          >
            Clear
          </Link>
        </Button>
      </div>
    ) : null;

  return (
    <DataTable
      data={result.items}
      columns={columns}
      getRowId={(row) => topIdOf(groupBy, row)}
      manualSorting
      manualPagination
      enableExpansion
      expandedRowIds={expandedTopId ? [expandedTopId] : []}
      onExpandedRowIdsChange={handleExpandedRowIds}
      getExpandLabel={getExpandLabel}
      renderExpandedRow={(row) => {
        const topId = topIdOf(groupBy, row);
        const midPage = midPageByTop[topId] ?? 1;
        const midSlice =
          midCache.get(midKeyForTop(topId, midPage)) ??
          ({ ...emptySlice(pageSize), loading: true } as PaginatedSlice<GroupMidItem>);
        return (
          <NestedMidPanel
            label={midLabel}
            slice={midSlice}
            onPageChange={(page) => {
              setMidPageByTop((prev) => ({ ...prev, [topId]: page }));
              void loadMidLevel(topId, page);
            }}
            onRetry={() => {
              void loadMidLevel(topId, midPage);
            }}
            groupBy={groupBy}
            expandedMidId={expandedMidId}
            onToggleMid={(midItem) => {
              const ids = resolveBranchModelIds(topId, midItem);
              if (expandedMidId === ids.midKey) {
                setExpandedMidId(null);
                return;
              }
              setExpandedMidId(ids.midKey);
              const pairKey = cacheKey([ids.branchId, ids.modelId]);
              setSerialPageByPair((prev) => ({ ...prev, [pairKey]: 1 }));
              void loadSerials(ids.branchId, ids.modelId, 1);
            }}
            serialCache={serialCache}
            serialKey={serialKey}
            onSerialPageChange={(branchId, modelId, page) => {
              const pairKey = cacheKey([branchId, modelId]);
              setSerialPageByPair((prev) => ({ ...prev, [pairKey]: page }));
              void loadSerials(branchId, modelId, page);
            }}
            onSerialRetry={(branchId, modelId, page) => {
              void loadSerials(branchId, modelId, page);
            }}
            serialPageByPair={serialPageByPair}
            resolveBranchModelIds={(midItem) => resolveBranchModelIds(topId, midItem)}
          />
        );
      }}
      stickyHeader
      search={{
        value: searchDraft,
        onChange: setSearchDraft,
        placeholder:
          groupBy === "by-branch"
            ? hideBranch
              ? "Search serial, SKU, model…"
              : "Search serial, SKU, model, branch…"
            : "Search serial, SKU, model, branch…",
      }}
      searchTrailing={
        <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={applySearch}>
          Search
        </Button>
      }
      toolbarLeading={
        <StockUnitsViewSwitch
          current={currentView}
          hrefForView={(view) =>
            stockUnitsHrefForView(view, {
              pageSize,
              offPlanogram: offPlanogramOnly,
              q: appliedSearch,
              filters: urlFilters,
            })
          }
        />
      }
      toolbarActions={
        <div className="flex items-center gap-2 text-sm">
          <input
            id="off-planogram-grouped"
            type="checkbox"
            checked={offPlanogramOnly}
            onChange={(event) => toggleOffPlanogram(event.target.checked)}
          />
          <Label htmlFor="off-planogram-grouped" className="font-normal">
            Off-planogram only
          </Label>
        </div>
      }
      banner={filterBanner}
      pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
      pagination={{
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        itemLabel: groupBy === "by-branch" ? "branch" : "model",
        buildHref: (page) =>
          buildStockUnitsHref({
            view: currentView,
            page,
            limit: pageSize,
            offPlanogram: offPlanogramOnly,
            q: appliedSearch,
            filters: urlFilters,
          }),
      }}
      footer={
        result.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No {groupBy === "by-branch" ? "branches" : "models"} match your filters
          </p>
        ) : null
      }
    />
  );
}

function createGroupColumns(
  groupBy: StockUnitsGroupBy,
  topLabel: string,
  indexOffset: number,
): DataTableColumn<GroupTopItem>[] {
  return [
    groupHelper.display({
      id: "index",
      header: "#",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => indexOffset + row.index + 1,
      meta: {
        mobile: "primary",
        className: "w-12 text-center tabular-nums text-muted-foreground",
      },
    }),
    groupHelper.display({
      id: "group",
      header: topLabel,
      cell: ({ row }) => <GroupTitle groupBy={groupBy} row={row.original} />,
      meta: { wrap: true, mobile: "primary", className: "min-w-0" },
    }),
    groupHelper.display({
      id: "stocks",
      header: "Stocks",
      cell: ({ row }) => <InventoryGroupCounts counts={row.original.counts} />,
      meta: {
        wrap: true,
        mobile: "primary",
        className: "w-36 max-w-36 align-top md:w-auto md:max-w-none",
      },
    }),
  ];
}

function groupTitleText(groupBy: StockUnitsGroupBy, row: GroupTopItem): string {
  switch (groupBy) {
    case "by-branch":
      return (row as InventoryGroupBranchItemDto).branch.name;
    case "by-model":
      return (row as InventoryGroupModelItemDto).model.sku;
    default: {
      const exhaustive: never = groupBy;
      return exhaustive;
    }
  }
}

function GroupTitle({ groupBy, row }: { groupBy: StockUnitsGroupBy; row: GroupTopItem }) {
  switch (groupBy) {
    case "by-branch": {
      const branch = (row as InventoryGroupBranchItemDto).branch;
      return (
        <>
          <span className="font-medium">{branch.name}</span>
          <span className="ml-2 font-mono text-xs text-muted-foreground">{branch.sapCode}</span>
        </>
      );
    }
    case "by-model": {
      const model = (row as InventoryGroupModelItemDto).model;
      return (
        <>
          <span className="font-mono font-medium">{model.sku}</span>
          <span className="ml-2 text-sm text-muted-foreground">{model.name}</span>
          {model.brand?.name ? (
            <span className="ml-2 text-xs text-muted-foreground">{model.brand.name}</span>
          ) : null}
        </>
      );
    }
    default: {
      const exhaustive: never = groupBy;
      return exhaustive;
    }
  }
}

function NestedMidPanel({
  label,
  slice,
  onPageChange,
  onRetry,
  groupBy,
  expandedMidId,
  onToggleMid,
  serialCache,
  serialKey,
  onSerialPageChange,
  onSerialRetry,
  serialPageByPair,
  resolveBranchModelIds,
}: {
  label: string;
  slice: PaginatedSlice<GroupMidItem>;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  groupBy: StockUnitsGroupBy;
  expandedMidId: string | null;
  onToggleMid: (mid: GroupMidItem) => void;
  serialCache: Map<string, PaginatedSlice<InventoryListItem>>;
  serialKey: (branchId: string, modelId: string, page: number) => string;
  onSerialPageChange: (branchId: string, modelId: string, page: number) => void;
  onSerialRetry: (branchId: string, modelId: string, page: number) => void;
  serialPageByPair: Record<string, number>;
  resolveBranchModelIds: (mid: GroupMidItem) => {
    branchId: string;
    modelId: string;
    midKey: string;
  };
}) {
  if (slice.error && slice.items.length === 0) {
    return <InlineLoadError message={slice.error} onRetry={onRetry} />;
  }

  if (slice.loading && slice.items.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">Loading {label.toLowerCase()}…</p>
    );
  }

  if (slice.total === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        No {label.toLowerCase()} in this group
      </p>
    );
  }

  return (
    <div className={cn("border-t bg-muted/15 px-3 py-3 sm:px-4", slice.loading && "opacity-70")}>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div>
        {slice.items.map((mid) => {
          const { branchId, modelId, midKey } = resolveBranchModelIds(mid);
          const isMidOpen = expandedMidId === midKey;
          const pairKey = cacheKey([branchId, modelId]);
          const serialPage = serialPageByPair[pairKey] ?? 1;
          const serialSlice = isMidOpen
            ? serialCache.get(serialKey(branchId, modelId, serialPage)) ??
              ({ ...emptySlice(slice.limit), loading: true } as PaginatedSlice<InventoryListItem>)
            : undefined;
          const title = midTitle(groupBy, mid);

          return (
            <div key={midKey} className="border-t border-border/50 first:border-t-0">
              <div
                className={cn(
                  "flex flex-wrap items-start gap-2 py-2",
                  isMidOpen && "bg-muted/25",
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0"
                  onClick={() => onToggleMid(mid)}
                  aria-expanded={isMidOpen}
                  aria-label={isMidOpen ? `Collapse ${title.text}` : `Expand ${title.text}`}
                >
                  {isMidOpen ? (
                    <ChevronDown className="size-4" aria-hidden />
                  ) : (
                    <ChevronRight className="size-4" aria-hidden />
                  )}
                </Button>
                <div className="min-w-0 flex-1 pt-2.5">{title.node}</div>
                <div className="w-full min-w-0 pt-1 md:w-auto md:pt-2">
                  <InventoryGroupCounts counts={mid.counts} compact />
                </div>
              </div>
              {isMidOpen && serialSlice ? (
                <GroupedSerialTable
                  slice={serialSlice}
                  onPageChange={(page) => onSerialPageChange(branchId, modelId, page)}
                  onRetry={() => onSerialRetry(branchId, modelId, serialSlice.page)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {slice.totalPages > 1 ? (
        <TablePagination
          meta={{
            total: slice.total,
            page: slice.page,
            totalPages: slice.totalPages,
            itemLabel: label.toLowerCase(),
          }}
          onPageChange={onPageChange}
          buttonClassName="min-h-11 min-w-11"
        />
      ) : null}
    </div>
  );
}

function midTitle(
  groupBy: StockUnitsGroupBy,
  mid: GroupMidItem,
): { text: string; node: ReactNode } {
  switch (groupBy) {
    case "by-branch": {
      const model = (mid as InventoryGroupModelItemDto).model;
      return {
        text: model.sku,
        node: (
          <>
            <span className="font-mono">{model.sku}</span>
            <span className="ml-2 text-muted-foreground">{model.name}</span>
          </>
        ),
      };
    }
    case "by-model": {
      const branch = (mid as InventoryGroupBranchInModelItemDto).branch;
      return {
        text: branch.name,
        node: (
          <>
            <span className="font-medium">{branch.name}</span>
            <span className="ml-2 font-mono text-xs text-muted-foreground">{branch.sapCode}</span>
          </>
        ),
      };
    }
    default: {
      const exhaustive: never = groupBy;
      return exhaustive;
    }
  }
}

function GroupedSerialTable({
  slice,
  onPageChange,
  onRetry,
}: {
  slice: PaginatedSlice<InventoryListItem>;
  onPageChange: (page: number) => void;
  onRetry: () => void;
}) {
  const columns = useMemo(
    () =>
      createInventorySerialColumns({
        indexOffset: (slice.page - 1) * slice.limit,
        includeBranch: false,
        includeModel: false,
        sortable: false,
      }),
    [slice.limit, slice.page],
  );

  return (
    <DataTable
      chrome="plain"
      data={slice.items}
      columns={columns}
      getRowId={(row) => row.id}
      manualSorting
      manualPagination
      loading={slice.loading}
      loadingMessage={slice.items.length === 0 ? "Loading serial numbers…" : undefined}
      errorMessage={slice.error ?? undefined}
      onRetry={onRetry}
      empty={!slice.loading && !slice.error && slice.total === 0}
      emptyMessage="No serial numbers in this group"
      pagination={
        slice.totalPages > 1
          ? {
              total: slice.total,
              page: slice.page,
              totalPages: slice.totalPages,
              itemLabel: "serial",
              onPageChange,
            }
          : undefined
      }
    />
  );
}

function InlineLoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <p className="text-destructive">{message}</p>
      <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
