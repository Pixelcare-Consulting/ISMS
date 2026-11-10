"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { createInventorySerialColumns } from "@/app/(app)/inventory/_components/inventory-serial-columns";
import { BRANCH_INVENTORY_V2_PAGE_SIZE, branchInventoryV2Href } from "@/app/(app)/inventory/v2/links";
import { BranchInventoryUnitDrawer } from "@/app/(app)/inventory/v2/_components/unit-drawer";
import {
  StatusConfirmDialog,
  type StatusConfirmKind,
} from "@/app/(app)/inventory/v2/_components/status-confirm-dialog";
import { V2Chrome } from "@/app/(app)/inventory/v2/_components/v2-chrome";
import { V2StatStrip } from "@/app/(app)/inventory/v2/_components/v2-stat-strip";
import { V2TealLink } from "@/app/(app)/inventory/v2/_components/v2-teal-link";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { reportInventoryDefectAction } from "@/features/inventory/actions/defect.actions";
import {
  updateInventoryStatusAction,
  type InventoryGroupBranchItemDto,
  type InventoryListItem,
  type InventoryStatusOption,
} from "@/features/inventory/actions/inventory.actions";
import { InventoryListRefreshProvider } from "@/features/inventory/components/inventory-list-refresh";
import { InventoryApprovalBranchIdsProvider } from "@/features/inventory/components/inventory-unit-status-cell";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  branchInventoryUnitTotal,
  branchSerialLabel,
  branchSerialSelectionBlock,
  type BranchSerialSelectionBlock,
} from "@/features/inventory/utils/branch-inventory-v2";
import { DataTable, type DataTableColumn, type DataTableFeatures } from "@/lib/data-table";
import type { PaginatedResult } from "@/lib/shared/pagination";

interface SerialListScreenProps {
  branchId: string;
  branch: InventoryGroupBranchItemDto | null;
  result: PaginatedResult<InventoryListItem>;
  statusOptions: InventoryStatusOption[];
  /** Every model at this branch. Not derived from the current page. */
  modelOptions: { sku: string; name: string }[];
  q: string;
  statusCodeId?: string;
  sku?: string;
  initialOffPlanogram?: boolean;
  limit: number;
  approvalBranchIds: string[] | null;
  singleBranch?: boolean;
  offPlanogramCount: number;
  seriesSummary?: ReactNode;
}

type SelectedSerial = { id: string; serialNo: string };

const serialV2Column = createColumnHelper<DataTableFeatures, InventoryListItem>();
const SEARCH_DEBOUNCE_MS = 300;
/**
 * Checkbox cells zero their right padding, so the gap lives on the index column.
 * Keep both columns tight — a little inset, not a wide spacer.
 */
const SELECT_COLUMN_CLASS = "w-0 whitespace-nowrap pl-4 pr-0";
const INDEX_COLUMN_CLASS =
  "w-0 whitespace-nowrap pl-4 pr-3 text-left tabular-nums text-muted-foreground";

function showNoStockBanner(input: {
  items: readonly { statusCode: { code: string } }[];
  total: number;
  selectedStatusCode?: string;
}): boolean {
  if (input.items.length === 0) return false;
  if (input.items.some((item) => item.statusCode.code === "STK")) return false;
  if (input.selectedStatusCode === "STK") return false;
  if (input.selectedStatusCode && input.selectedStatusCode !== "STK") return true;
  return input.total <= input.items.length;
}

function selectionBlockLabel(block: BranchSerialSelectionBlock): string {
  switch (block) {
    case "missing-serial":
      return "Not eligible — serial number was not provided";
    case "pending-defect":
      return "Not eligible — waiting for the team leader";
    case "not-stock":
      return "Not eligible — only in-stock units can be selected";
    default: {
      const unexpected: never = block;
      return unexpected;
    }
  }
}

function actionError(result: { error?: string }): string | null {
  return "error" in result && result.error ? result.error : null;
}

export function BranchInventorySerialScreen(props: SerialListScreenProps) {
  return (
    <InventoryApprovalBranchIdsProvider approvalBranchIds={props.approvalBranchIds}>
      <InventoryListRefreshProvider>
        <SerialListBody {...props} />
      </InventoryListRefreshProvider>
    </InventoryApprovalBranchIdsProvider>
  );
}

function SerialListBody({
  branchId,
  branch,
  result,
  statusOptions,
  modelOptions,
  q,
  statusCodeId,
  sku,
  initialOffPlanogram = false,
  limit,
  singleBranch = false,
  offPlanogramCount,
  seriesSummary,
}: SerialListScreenProps) {
  const router = useRouter();
  const [query, setQuery] = useState(q);
  const [offPlanogramOnly, setOffPlanogramOnly] = useState(initialOffPlanogram);
  const urlQueryRef = useRef(q);
  const [selected, setSelected] = useState<SelectedSerial[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<StatusConfirmKind>("display");
  const [busy, setBusy] = useState(false);
  const [openUnit, setOpenUnit] = useState<InventoryListItem | null>(null);

  const branchName = branch?.branch.name ?? result.items[0]?.branch.name ?? "Branch";
  const sapCode = branch?.branch.sapCode ?? result.items[0]?.branch.sapCode ?? "";
  const statuses = branch?.counts.statuses ?? [];
  const eligible = result.items.filter(
    (item) =>
      branchSerialSelectionBlock({
        serialNo: item.serialNumber.serialNo,
        statusCode: item.statusCode.code,
        pendingDefectInspection: item.pendingDefectInspection,
      }) === null,
  );
  const selectedIds = useMemo(
    () => new Set(selected.map((unit) => unit.id)),
    [selected],
  );
  const allEligibleSelected =
    eligible.length > 0 && eligible.every((item) => selectedIds.has(item.id));
  const modelMenu = useMemo(() => {
    if (!sku || modelOptions.some((model) => model.sku === sku)) return modelOptions;
    return [...modelOptions, { sku, name: sku }].sort((a, b) =>
      a.sku.localeCompare(b.sku, undefined, { sensitivity: "base" }),
    );
  }, [modelOptions, sku]);
  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        result.items.map((row) => row.serialNumber.serialNo),
        result.items.map((row) => row.serialNumber.model.sku),
        result.items.map((row) => row.serialNumber.model.name),
        result.items.map((row) => row.statusCode.name),
        result.items.map((row) => row.statusCode.code),
        result.items.map((row) => row.deliveryNo),
      ),
    [result.items],
  );
  const statusMenu = useMemo(() => {
    const byId = new Map(statusOptions.map((option) => [option.id, option]));
    for (const item of result.items) {
      const status = item.statusCode;
      if (byId.has(status.id)) continue;
      byId.set(status.id, { id: status.id, code: status.code, name: status.name });
    }
    return [...byId.values()];
  }, [result.items, statusOptions]);
  const selectedStatusCode = statusMenu.find((option) => option.id === statusCodeId)?.code;
  const noStockBanner = showNoStockBanner({
    items: result.items,
    total: result.total,
    selectedStatusCode,
  });
  const totalUnits = branch
    ? branchInventoryUnitTotal(branch.counts)
    : statuses.reduce((sum, item) => sum + item.count, 0);

  const hrefFor = useCallback(
    (next: {
      q?: string;
      statusCodeId?: string;
      sku?: string;
      page?: number;
      offPlanogram?: boolean;
    }) =>
      branchInventoryV2Href({
        branchId,
        q: next.q,
        statusCodeId: next.statusCodeId,
        sku: next.sku,
        page: next.page,
        limit: limit === BRANCH_INVENTORY_V2_PAGE_SIZE ? undefined : limit,
        offPlanogram: next.offPlanogram ?? offPlanogramOnly,
      }),
    [branchId, limit, offPlanogramOnly],
  );

  useEffect(() => {
    const previous = urlQueryRef.current;
    urlQueryRef.current = q;
    setQuery((current) => (current.trim() === previous.trim() ? q : current));
  }, [q]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = query.trim();
      if (next === q) return;
      router.push(
        hrefFor({
          q: next,
          statusCodeId,
          sku,
          page: 1,
        }),
        { scroll: false },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [hrefFor, q, query, router, sku, statusCodeId]);

  const toggle = useCallback((item: InventoryListItem) => {
    setSelected((current) => {
      if (current.some((unit) => unit.id === item.id)) {
        return current.filter((unit) => unit.id !== item.id);
      }
      return [
        ...current,
        { id: item.id, serialNo: item.serialNumber.serialNo.trim() },
      ];
    });
  }, []);

  function openChangeStatus(kind: StatusConfirmKind = "display") {
    setConfirmKind(kind);
    setConfirmOpen(true);
  }

  function toggleOffPlanogram(checked: boolean) {
    setOffPlanogramOnly(checked);
    router.push(
      hrefFor({
        q: query.trim(),
        statusCodeId,
        sku,
        page: 1,
        offPlanogram: checked,
      }),
      { scroll: false },
    );
  }

  async function applyConfirmed(kind: StatusConfirmKind, reason: string) {
    if (selected.length === 0) return;
    setBusy(true);
    const failures: string[] = [];
    for (const unit of selected) {
      switch (kind) {
        case "display": {
          const updated = await updateInventoryStatusAction(unit.id, "DU");
          const error = actionError(updated);
          if (error) failures.push(error);
          break;
        }
        case "defect": {
          const reported = await reportInventoryDefectAction({
            branchInventoryId: unit.id,
            reason,
          });
          const error = actionError(reported);
          if (error) failures.push(error);
          break;
        }
        default: {
          const unexpected: never = kind;
          failures.push(`Unsupported change (${unexpected})`);
        }
      }
    }
    setBusy(false);
    const done = selected.length - failures.length;
    if (done === 0) {
      toast.error(failures[0] ?? "Nothing was updated");
      return;
    }
    if (failures.length > 0) {
      toast.error(`${done} updated. ${failures.length} could not be updated.`);
    } else if (kind === "display") {
      toast.success(done === 1 ? "Marked as a display unit" : `Marked ${done} display units`);
    } else {
      toast.success(
        done === 1 ? "Sent to the team leader" : `Sent ${done} reports to the team leader`,
      );
    }
    setSelected([]);
    setConfirmOpen(false);
    router.refresh();
  }

  const indexOffset = (result.page - 1) * result.limit;

  const setEligibleSelection = useCallback(
    (next: SelectedSerial[]) => setSelected(next),
    [],
  );

  const orderedColumns = useMemo((): DataTableColumn<InventoryListItem>[] => {
    const dataColumns = createInventorySerialColumns({
      indexOffset,
      includeBranch: false,
      includeModel: true,
      sortable: false,
      agingHeader: "Aging",
    });
    const indexSource = dataColumns.find((column) => column.id === "index");
    const indexColumn = indexSource
      ? {
          ...indexSource,
          meta: {
            ...indexSource.meta,
            className: INDEX_COLUMN_CLASS,
          },
        }
      : undefined;

    const serialColumn = dataColumns.find((column) => column.id === "serial")!;

    const trailing = dataColumns
      .filter(
        (column) => column.id !== "index" && column.id !== "serial" && column.id !== "model",
      )
      .map((column) => {
        if (column.id !== "status") return column;
        return {
          ...column,
          cell: ({ row }) => (
            <StatusCodeBadge
              code={row.original.statusCode.code}
              name={row.original.statusCode.name}
              color={row.original.statusCode.color}
              codeOnly
            />
          ),
        } satisfies DataTableColumn<InventoryListItem>;
      });

    const modelColumn =
      dataColumns.find((column) => column.id === "model") ??
      serialV2Column.accessor((row) => row.serialNumber.model.sku, {
        id: "model",
        header: "Model / product",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block font-mono font-medium">{row.original.serialNumber.model.sku}</span>
            <span className="block text-xs text-muted-foreground">
              {row.original.serialNumber.model.name}
            </span>
          </div>
        ),
        meta: { wrap: true, mobile: "primary", className: "min-w-0" },
      });

    const exceptionColumn: DataTableColumn<InventoryListItem> = serialV2Column.display({
      id: "exception",
      header: "Exception",
      enableSorting: false,
      cell: ({ row }) =>
        row.original.onPlanogram ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Off planogram
          </span>
        ),
      meta: { mobile: "detail" },
    });

    const selectCol: DataTableColumn<InventoryListItem> = serialV2Column.display({
      id: "select",
      header: () => (
        <Checkbox
          checked={allEligibleSelected}
          disabled={eligible.length === 0}
          aria-label="Select in-stock units on this page"
          onCheckedChange={(checked) => {
            if (checked === true) {
              setEligibleSelection(
                eligible.map((item) => ({
                  id: item.id,
                  serialNo: item.serialNumber.serialNo.trim(),
                })),
              );
              return;
            }
            setEligibleSelection([]);
          }}
        />
      ),
      enableSorting: false,
      cell: ({ row }) => {
        const block = branchSerialSelectionBlock({
          serialNo: row.original.serialNumber.serialNo,
          statusCode: row.original.statusCode.code,
          pendingDefectInspection: row.original.pendingDefectInspection,
        });
        const isSelected = selectedIds.has(row.original.id);
        return (
          <Checkbox
            checked={isSelected}
            disabled={block !== null}
            aria-label={
              block
                ? selectionBlockLabel(block)
                : `Select ${branchSerialLabel(row.original.serialNumber.serialNo)}`
            }
            onCheckedChange={() => {
              if (block) return;
              toggle(row.original);
            }}
          />
        );
      },
      meta: { mobile: "primary", className: SELECT_COLUMN_CLASS },
    });

    return [
      selectCol,
      ...(indexColumn ? [indexColumn] : []),
      serialColumn,
      modelColumn,
      ...trailing,
      exceptionColumn,
    ];
  }, [
    allEligibleSelected,
    eligible,
    indexOffset,
    selectedIds,
    setEligibleSelection,
    toggle,
  ]);

  const openDrawerChangeStatus = useCallback((item: InventoryListItem) => {
    setSelected([{ id: item.id, serialNo: item.serialNumber.serialNo.trim() }]);
    setConfirmKind("display");
    setConfirmOpen(true);
  }, []);

  const renderRowActions = useCallback(
    (row: InventoryListItem) => {
      const block = branchSerialSelectionBlock({
        serialNo: row.serialNumber.serialNo,
        statusCode: row.statusCode.code,
        pendingDefectInspection: row.pendingDefectInspection,
      });
      if (block === "missing-serial" || !row.serialNumber.serialNo.trim()) {
        return <span className="text-sm text-muted-foreground">Serial unavailable</span>;
      }
      return (
        <V2TealLink className="cursor-pointer" onClick={() => setOpenUnit(row)}>
          View unit details →
        </V2TealLink>
      );
    },
    [],
  );

  const getRowClassName = useCallback(
    (row: InventoryListItem) =>
      selectedIds.has(row.id) ? "bg-emerald-50/60 dark:bg-teal-950/20" : undefined,
    [selectedIds],
  );

  const branchHeading = [
    branchName,
    sapCode,
    singleBranch ? "" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5">
      <V2Chrome
        screen="branch"
        title={branchHeading}
        subtitle="All units in one place, with serial numbers visible."
      />
      <V2StatStrip
        statuses={statuses}
        totalUnits={totalUnits}
        offPlanogramCount={offPlanogramCount}
      />

      {seriesSummary ? <div className="motion-reduce:transition-none">{seriesSummary}</div> : null}

      {/* <p className="text-sm text-muted-foreground">
        Select in-stock units to mark them as display units, or send a defect for the team leader to
        approve. The unit stays in stock until that approval.
      </p> */}

      {selected.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 dark:border-teal-900/50 dark:bg-teal-950/25"
          aria-live="polite"
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-teal-900 dark:text-teal-100">
              {selected.length} STK {selected.length === 1 ? "unit" : "units"} selected
            </span>
            {eligible.length > 0 && !allEligibleSelected ? (
              <button
                type="button"
                className="text-sm font-medium text-teal-800 underline-offset-4 hover:underline dark:text-teal-300"
                onClick={() =>
                  setSelected(
                    eligible.map((item) => ({
                      id: item.id,
                      serialNo: item.serialNumber.serialNo.trim(),
                    })),
                  )
                }
              >
                Select all {eligible.length} STK units
              </button>
            ) : null}
          </div>
          <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 dark:bg-teal-500"
              onClick={() => openChangeStatus("display")}
            >
              Change status
            </Button>
          </div>
        </div>
      ) : null}

      <DataTable
        data={result.items}
        columns={orderedColumns}
        getRowId={(row) => row.id}
        manualPagination
        stickyHeader
        chrome="card"
        className="overflow-x-auto"
        tableClassName="min-w-[48rem]"
        renderRowActions={renderRowActions}
        getRowClassName={getRowClassName}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search serial number or model…",
          suggestions,
        }}
        toolbarActions={
          <>
            <Select
              value={statusCodeId ?? "all"}
              onValueChange={(value) => {
                router.push(
                  hrefFor({
                    q: query.trim(),
                    statusCodeId: value === "all" ? undefined : value,
                    sku,
                    page: 1,
                  }),
                  { scroll: false },
                );
              }}
            >
              <SelectTrigger aria-label="Filter by status" className="w-[11rem]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statusMenu.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={sku ?? "all"}
              onValueChange={(value) => {
                router.push(
                  hrefFor({
                    q: query.trim(),
                    statusCodeId,
                    sku: value === "all" ? undefined : value,
                    page: 1,
                  }),
                  { scroll: false },
                );
              }}
            >
              <SelectTrigger aria-label="Filter by model" className="w-[11rem]">
                <SelectValue placeholder="All models" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All models</SelectItem>
                {modelMenu.map((model) => (
                  <SelectItem key={model.sku} value={model.sku}>
                    {model.sku}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Checkbox
                id="v2-branch-off-planogram"
                checked={offPlanogramOnly}
                aria-label="Off-planogram only"
                onCheckedChange={(checked) => toggleOffPlanogram(checked === true)}
              />
              <Label htmlFor="v2-branch-off-planogram" className="font-normal">
                Off-planogram only
              </Label>
            </div>
          </>
        }
       
        empty={result.items.length === 0}
        emptyMessage="No units match this branch."
        pagination={{
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          itemLabel: "unit",
          buildHref: (page) => hrefFor({ q, statusCodeId, sku, page }),
        }}
        footer={
          result.items.length > 0 ? (
            <div className="space-y-1 border-t px-4 py-3 text-xs text-muted-foreground">
              <p>
                Showing all {result.total.toLocaleString()}{" "}
                {result.total === 1 ? "unit" : "units"} · {eligible.length.toLocaleString()}{" "}
                eligible STK units
              </p>
              <p>Only STK units can be selected.</p>
            </div>
          ) : null
        }
        banner={
          noStockBanner ? (
            <p className="border-b px-4 py-3 text-sm text-muted-foreground" role="status">
              No STK units available. Only in-stock (STK) units can be changed to DU or DEF.
            </p>
          ) : null
        }
      />

      <StatusConfirmDialog
        key={confirmOpen ? `open-${confirmKind}` : "closed"}
        open={confirmOpen}
        initialKind={confirmKind}
        units={selected}
        statuses={statuses}
        busy={busy}
        onOpenChange={(open) => {
          if (!open) setConfirmOpen(false);
        }}
        onConfirm={(kind, reason) => {
          void applyConfirmed(kind, reason);
        }}
      />
      <BranchInventoryUnitDrawer
        unit={openUnit}
        onOpenChange={(open) => {
          if (!open) setOpenUnit(null);
        }}
        onRequestChangeStatus={() => {
          if (openUnit) openDrawerChangeStatus(openUnit);
        }}
      />
    </div>
  );
}
