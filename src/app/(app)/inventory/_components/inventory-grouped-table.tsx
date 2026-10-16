"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import {
  listInventoryGroupChildrenAction,
  type InventoryGroupBranchInModelItemDto,
  type InventoryGroupBranchItemDto,
  type InventoryGroupModelItemDto,
  type InventoryListItem,
} from "@/features/inventory/actions/inventory.actions";
import type { StockUnitsGroupBy } from "@/features/inventory/constants/stock-units-group";
import { TableIndexCell, TableIndexHead } from "@/components/data-table";
import {
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { TablePagination } from "@/components/data-table/table-pagination";
import { GlobalDataTable } from "@/lib/data-table";
import type { PaginatedResult } from "@/lib/shared/pagination";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/utils/cn";

import { InventoryGroupCounts } from "@/app/(app)/inventory/_components/inventory-group-counts";
import { InventorySerialLeafRow } from "@/app/(app)/inventory/_components/inventory-serial-leaf-row";
import {
  buildStockUnitsHref,
  stockUnitsHrefForView,
} from "@/app/(app)/inventory/_components/stock-units-url";
import { StockUnitsViewSwitch } from "@/app/(app)/inventory/_components/stock-units-view-switch";
import type { StockUnitsView } from "@/features/inventory/constants/stock-units-view";

type GroupTopItem = InventoryGroupBranchItemDto | InventoryGroupModelItemDto;

type PaginatedSlice<T> = {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  loading: boolean;
};

function emptySlice(limit: number): PaginatedSlice<never> {
  return { items: [], total: 0, page: 1, totalPages: 1, limit, loading: false };
}

function cacheKey(
  parts: (string | number | undefined | null)[],
): string {
  return parts.filter((p) => p !== undefined && p !== null && p !== "").join(":");
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
    Map<string, PaginatedSlice<InventoryGroupModelItemDto | InventoryGroupBranchInModelItemDto>>
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

  const loadMidLevel = useCallback(
    async (topId: string, page = 1) => {
      const key = cacheKey([
        "mid",
        groupBy,
        topId,
        page,
        pageSize,
        filterSuffix,
      ]);
      setMidCache((prev) => {
        const next = new Map(prev);
        const existing = next.get(key) ?? emptySlice(pageSize);
        next.set(key, { ...existing, loading: true });
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
            items: response.items as (
              | InventoryGroupModelItemDto
              | InventoryGroupBranchInModelItemDto
            )[],
            total: response.total,
            page: response.page,
            totalPages: response.totalPages,
            limit: response.limit,
            loading: false,
          });
          return next;
        });
      } catch {
        toast.error("Could not load group details");
        setMidCache((prev) => {
          const next = new Map(prev);
          next.set(key, emptySlice(pageSize));
          return next;
        });
      }
    },
    [groupBy, filterSuffix, listFilters, pageSize],
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
        next.set(key, { ...existing, loading: true });
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
          });
          return next;
        });
      } catch {
        toast.error("Could not load serial numbers");
        setSerialCache((prev) => {
          const next = new Map(prev);
          next.set(key, emptySlice(pageSize));
          return next;
        });
      }
    },
    [groupBy, filterSuffix, listFilters, pageSize],
  );

  function toggleTop(id: string) {
    if (expandedTopId === id) {
      setExpandedTopId(null);
      setExpandedMidId(null);
      return;
    }
    setExpandedTopId(id);
    setExpandedMidId(null);
    setMidPageByTop((prev) => ({ ...prev, [id]: 1 }));
    void loadMidLevel(id, 1);
  }

  function toggleMid(
    _topId: string,
    midId: string,
    branchId: string,
    modelId: string,
  ) {
    if (expandedMidId === midId) {
      setExpandedMidId(null);
      return;
    }
    setExpandedMidId(midId);
    const pairKey = cacheKey([branchId, modelId]);
    setSerialPageByPair((prev) => ({ ...prev, [pairKey]: 1 }));
    void loadSerials(branchId, modelId, 1);
  }

  function resolveBranchModelIds(
    topId: string,
    midItem: InventoryGroupModelItemDto | InventoryGroupBranchInModelItemDto,
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

  const topLabel = groupBy === "by-branch" ? "Branch" : "Model";
  const midLabel = groupBy === "by-branch" ? "Models" : "Branches";

  const midKeyForTop = (topId: string, page: number) =>
    cacheKey(["mid", groupBy, topId, page, pageSize, filterSuffix]);

  const serialKey = (branchId: string, modelId: string, page: number) =>
    cacheKey([
      "serial",
      groupBy,
      branchId,
      modelId,
      page,
      pageSize,
      filterSuffix,
    ]);

  return (
    <GlobalDataTable
      stickyHeader
      scrollable
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
        <Button type="button" size="sm" variant="outline" onClick={applySearch}>
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
            onChange={(e) => toggleOffPlanogram(e.target.checked)}
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
    >
      <TableHeader>
        <TableRow>
          <TableHead className="w-10" aria-label="Expand" />
          <TableIndexHead />
          <TableHead>{topLabel}</TableHead>
          <TableHead className="min-w-72">Stocks</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {result.items.map((row, index) => {
          const topId =
            groupBy === "by-branch"
              ? (row as InventoryGroupBranchItemDto).branch.id
              : (row as InventoryGroupModelItemDto).model.id;
          const isTopOpen = expandedTopId === topId;
          const midPage = midPageByTop[topId] ?? 1;
          const midPageKey = midKeyForTop(topId, midPage);
          const midSlice =
            midCache.get(midPageKey) ??
            (isTopOpen ? { ...emptySlice(pageSize), loading: true } : undefined);

          return (
            <TopGroupRows
              key={topId}
              groupBy={groupBy}
              row={row}
              index={(result.page - 1) * result.limit + index + 1}
              isOpen={isTopOpen}
              onToggle={() => toggleTop(topId)}
              midLabel={midLabel}
              midSlice={isTopOpen ? midSlice : undefined}
              onMidPageChange={(page) => {
                setMidPageByTop((prev) => ({ ...prev, [topId]: page }));
                void loadMidLevel(topId, page);
              }}
              expandedMidId={expandedMidId}
              onToggleMid={(midItem) => {
                const { branchId, modelId, midKey } = resolveBranchModelIds(
                  topId,
                  midItem,
                );
                toggleMid(topId, midKey, branchId, modelId);
              }}
              serialCache={serialCache}
              serialKey={serialKey}
              onSerialPageChange={(branchId, modelId, page) => {
                const pairKey = cacheKey([branchId, modelId]);
                setSerialPageByPair((prev) => ({ ...prev, [pairKey]: page }));
                void loadSerials(branchId, modelId, page);
              }}
              serialPageByPair={serialPageByPair}
              resolveBranchModelIds={(midItem) =>
                resolveBranchModelIds(topId, midItem)
              }
              hideBranch={hideBranch}
            />
          );
        })}
      </TableBody>
    </GlobalDataTable>
  );
}

interface TopGroupRowsProps {
  groupBy: StockUnitsGroupBy;
  row: GroupTopItem;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  midLabel: string;
  midSlice?: PaginatedSlice<
    InventoryGroupModelItemDto | InventoryGroupBranchInModelItemDto
  >;
  onMidPageChange: (page: number) => void;
  expandedMidId: string | null;
  onToggleMid: (
    mid: InventoryGroupModelItemDto | InventoryGroupBranchInModelItemDto,
  ) => void;
  serialCache: Map<string, PaginatedSlice<InventoryListItem>>;
  serialKey: (branchId: string, modelId: string, page: number) => string;
  onSerialPageChange: (branchId: string, modelId: string, page: number) => void;
  serialPageByPair: Record<string, number>;
  resolveBranchModelIds: (
    mid: InventoryGroupModelItemDto | InventoryGroupBranchInModelItemDto,
  ) => { branchId: string; modelId: string; midKey: string };
  hideBranch: boolean;
}

function TopGroupRows({
  groupBy,
  row,
  index,
  isOpen,
  onToggle,
  midLabel,
  midSlice,
  onMidPageChange,
  expandedMidId,
  onToggleMid,
  serialCache,
  serialKey,
  onSerialPageChange,
  serialPageByPair,
  resolveBranchModelIds,
  hideBranch,
}: TopGroupRowsProps) {
  const title =
    groupBy === "by-branch" ? (
      <>
        <span className="font-medium">
          {(row as InventoryGroupBranchItemDto).branch.name}
        </span>
        <span className="ml-2 font-mono text-xs text-muted-foreground">
          {(row as InventoryGroupBranchItemDto).branch.sapCode}
        </span>
      </>
    ) : (
      <>
        <span className="font-mono font-medium">
          {(row as InventoryGroupModelItemDto).model.sku}
        </span>
        <span className="ml-2 text-sm text-muted-foreground">
          {(row as InventoryGroupModelItemDto).model.name}
        </span>
        {(row as InventoryGroupModelItemDto).model.brand?.name ? (
          <span className="ml-2 text-xs text-muted-foreground">
            {(row as InventoryGroupModelItemDto).model.brand?.name}
          </span>
        ) : null}
      </>
    );

  return (
    <>
      <TableRow className={cn(isOpen && "bg-muted/30")}>
        <TableCell className="w-10 px-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-label={isOpen ? "Collapse group" : "Expand group"}
          >
            {isOpen ? (
              <ChevronDown className="size-4" aria-hidden />
            ) : (
              <ChevronRight className="size-4" aria-hidden />
            )}
          </Button>
        </TableCell>
        <TableIndexCell index={index} />
        <TableCell className="min-w-0 whitespace-normal">{title}</TableCell>
        <TableCell className="align-top whitespace-normal">
          <InventoryGroupCounts counts={row.counts} />
        </TableCell>
      </TableRow>
      {isOpen ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={4} className="bg-muted/20 p-0">
            <NestedMidPanel
              label={midLabel}
              slice={midSlice}
              onPageChange={onMidPageChange}
              groupBy={groupBy}
              expandedMidId={expandedMidId}
              onToggleMid={onToggleMid}
              serialCache={serialCache}
              serialKey={serialKey}
              onSerialPageChange={onSerialPageChange}
              serialPageByPair={serialPageByPair}
              resolveBranchModelIds={resolveBranchModelIds}
              hideBranch={hideBranch}
            />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function NestedMidPanel({
  label,
  slice,
  onPageChange,
  groupBy,
  expandedMidId,
  onToggleMid,
  serialCache,
  serialKey,
  onSerialPageChange,
  serialPageByPair,
  resolveBranchModelIds,
  hideBranch,
}: {
  label: string;
  slice?: PaginatedSlice<
    InventoryGroupModelItemDto | InventoryGroupBranchInModelItemDto
  >;
  onPageChange: (page: number) => void;
  groupBy: StockUnitsGroupBy;
  expandedMidId: string | null;
  onToggleMid: (
    mid: InventoryGroupModelItemDto | InventoryGroupBranchInModelItemDto,
  ) => void;
  serialCache: Map<string, PaginatedSlice<InventoryListItem>>;
  serialKey: (branchId: string, modelId: string, page: number) => string;
  onSerialPageChange: (branchId: string, modelId: string, page: number) => void;
  serialPageByPair: Record<string, number>;
  resolveBranchModelIds: (
    mid: InventoryGroupModelItemDto | InventoryGroupBranchInModelItemDto,
  ) => { branchId: string; modelId: string; midKey: string };
  hideBranch: boolean;
}) {
  if (!slice || (slice.loading && slice.items.length === 0)) {
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
    <div
      className={cn(
        "border-t border-border/60 px-3 py-3 sm:px-4",
        slice.loading && "opacity-70",
      )}
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="overflow-hidden rounded-md border border-border/70 bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-10 p-2" />
              <th className="p-2">{groupBy === "by-branch" ? "Model" : "Branch"}</th>
              <th className="min-w-72 p-2">Stocks</th>
            </tr>
          </thead>
          <tbody>
            {slice.items.map((mid) => {
              const { branchId, modelId, midKey } = resolveBranchModelIds(mid);
              const isMidOpen = expandedMidId === midKey;
              const pairKey = cacheKey([branchId, modelId]);
              const serialPage = serialPageByPair[pairKey] ?? 1;
              const serialSliceKey = serialKey(branchId, modelId, serialPage);
              const serialSlice = isMidOpen
                ? serialCache.get(serialSliceKey) ??
                  ({ ...emptySlice(slice.limit), loading: true } as PaginatedSlice<InventoryListItem>)
                : undefined;

              const midTitle =
                groupBy === "by-branch" ? (
                  <>
                    <span className="font-mono">
                      {(mid as InventoryGroupModelItemDto).model.sku}
                    </span>
                    <span className="ml-2 text-muted-foreground">
                      {(mid as InventoryGroupModelItemDto).model.name}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-medium">
                      {(mid as InventoryGroupBranchInModelItemDto).branch.name}
                    </span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {(mid as InventoryGroupBranchInModelItemDto).branch.sapCode}
                    </span>
                  </>
                );

              return (
                <MidRows
                  key={midKey}
                  isOpen={isMidOpen}
                  onToggle={() => onToggleMid(mid)}
                  title={midTitle}
                  counts={mid.counts}
                  serialSlice={serialSlice}
                  hideBranch={hideBranch}
                  onSerialPageChange={(page) =>
                    onSerialPageChange(branchId, modelId, page)
                  }
                />
              );
            })}
          </tbody>
        </table>
      </div>
      {slice.totalPages > 1 ? (
        <div className="mt-2 flex justify-end">
          <TablePagination
            meta={{
              total: slice.total,
              page: slice.page,
              totalPages: slice.totalPages,
              itemLabel: label.toLowerCase(),
            }}
            onPageChange={onPageChange}
          />
        </div>
      ) : null}
    </div>
  );
}

function MidRows({
  isOpen,
  onToggle,
  title,
  counts,
  serialSlice,
  hideBranch,
  onSerialPageChange,
}: {
  isOpen: boolean;
  onToggle: () => void;
  title: ReactNode;
  counts: GroupTopItem["counts"];
  serialSlice?: PaginatedSlice<InventoryListItem>;
  hideBranch: boolean;
  onSerialPageChange: (page: number) => void;
}) {
  return (
    <>
      <tr className={cn("border-t border-border/50", isOpen && "bg-muted/20")}>
        <td className="p-2 align-top">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onToggle}
            aria-expanded={isOpen}
          >
            {isOpen ? (
              <ChevronDown className="size-4" aria-hidden />
            ) : (
              <ChevronRight className="size-4" aria-hidden />
            )}
          </Button>
        </td>
        <td className="p-2 align-top">{title}</td>
        <td className="p-2 align-top whitespace-normal">
          <InventoryGroupCounts counts={counts} compact />
        </td>
      </tr>
      {isOpen ? (
        <tr>
          <td colSpan={3} className="bg-muted/10 p-0">
            <SerialNestedTable
              slice={serialSlice}
              hideBranch={hideBranch}
              onPageChange={onSerialPageChange}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function SerialNestedTable({
  slice,
  hideBranch,
  onPageChange,
}: {
  slice?: PaginatedSlice<InventoryListItem>;
  hideBranch: boolean;
  onPageChange: (page: number) => void;
}) {
  if (!slice || (slice.loading && slice.items.length === 0)) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">Loading serial numbers…</p>
    );
  }

  if (slice.total === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">No serial numbers in this group</p>
    );
  }

  const startIndex = (slice.page - 1) * slice.limit;

  return (
    <div className={cn("px-2 py-2 sm:px-3", slice.loading && "opacity-70")}>
      <div className="overflow-x-auto rounded-md border border-border/60 bg-background">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-12 p-2 text-center">#</th>
              {hideBranch ? null : <th className="p-2">Branch</th>}
              <th className="p-2">Model</th>
              <th className="p-2">Serial</th>
              <th className="p-2">DR#</th>
              <th className="p-2">DR date</th>
              <th className="p-2">Planogram</th>
              <th className="p-2 text-center">Aging</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {slice.items.map((item, i) => (
              <InventorySerialLeafRow
                key={item.id}
                row={item}
                index={startIndex + i + 1}
                hideBranch={hideBranch}
              />
            ))}
          </tbody>
        </table>
      </div>
      {slice.totalPages > 1 ? (
        <div className="mt-2 flex justify-end">
          <TablePagination
            meta={{
              total: slice.total,
              page: slice.page,
              totalPages: slice.totalPages,
              itemLabel: "serial",
            }}
            onPageChange={onPageChange}
          />
        </div>
      ) : null}
    </div>
  );
}
