"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { createInventorySerialColumns } from "@/app/(app)/inventory/_components/inventory-serial-columns";
import { branchInventoryV2Href } from "@/app/(app)/inventory/v2/links";
import { BranchInventoryUnitDrawer } from "@/app/(app)/inventory/v2/_components/unit-drawer";
import {
  StatusConfirmDialog,
  type StatusConfirmKind,
} from "@/app/(app)/inventory/v2/_components/status-confirm-dialog";
import { V2Chrome } from "@/app/(app)/inventory/v2/_components/v2-chrome";
import { V2StatStrip } from "@/app/(app)/inventory/v2/_components/v2-stat-strip";
import { V2TealLink } from "@/app/(app)/inventory/v2/_components/v2-teal-link";
import type { TablePageSize } from "@/components/data-table/table-page-size";
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
  branchChangeableStatus,
  branchInventoryChangeableHint,
  branchInventoryUnitTotal,
  branchSerialLabel,
  branchSerialSelectionBlock,
  isBranchInventoryV2HiddenStatus,
  type BranchChangeableStatus,
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
  /** Unread units per status code for this branch. */
  unreadByCode?: Record<string, number>;
  /** Units on this page whose status changed since they were last opened. */
  unreadIds?: readonly string[];
  seriesSummary?: ReactNode;
}

type SelectedSerial = {
  id: string;
  serialNo: string;
  statusCode: BranchChangeableStatus;
};

const serialV2Column = createColumnHelper<DataTableFeatures, InventoryListItem>();
const SEARCH_DEBOUNCE_MS = 300;
/**
 * Checkbox cells zero their right padding, so the gap lives on the index column.
 * Keep both columns tight — a little inset, not a wide spacer.
 */
const SELECT_COLUMN_CLASS = "w-0 whitespace-nowrap pl-4 pr-0";
const INDEX_COLUMN_CLASS =
  "w-0 whitespace-nowrap pl-4 pr-3 text-left tabular-nums text-muted-foreground";

function selectionBlockLabel(block: BranchSerialSelectionBlock): string {
  switch (block) {
    case "missing-serial":
      return "Not eligible — serial number was not provided";
    case "pending-defect":
      return "Not eligible — waiting for the team leader";
    case "defective":
      return "Not eligible — a defective unit cannot be changed";
    case "not-stock":
      return "Not eligible — only in-stock and display units can be selected";
    case "other-status":
      return "Not eligible — select one status at a time";
    default: {
      const unexpected: never = block;
      return unexpected;
    }
  }
}

function toSelected(item: InventoryListItem): SelectedSerial | null {
  const statusCode = branchChangeableStatus(item.statusCode.code);
  if (!statusCode) return null;
  return {
    id: item.id,
    serialNo: item.serialNumber.serialNo.trim(),
    statusCode,
  };
}

function selectedUnits(items: readonly InventoryListItem[]): SelectedSerial[] {
  return items.flatMap((item) => {
    const next = toSelected(item);
    return next ? [next] : [];
  });
}

function selectAllAriaLabel(input: {
  status: BranchChangeableStatus | null;
  targetCount: number;
  eligibleCount: number;
}): string {
  if (input.eligibleCount === 0) return "No units can be selected";
  if (!input.status || input.targetCount === 0) return "Select one status at a time";
  return `Select ${input.status} units on this page`;
}

function confirmedMessage(kind: StatusConfirmKind, done: number): string {
  switch (kind) {
    case "display":
      return done === 1 ? "Marked as a display unit" : `Marked ${done} display units`;
    case "stock":
      return done === 1 ? "Returned to stock" : `Returned ${done} units to stock`;
    case "defect":
      return done === 1 ? "Sent to the team leader" : `Sent ${done} reports to the team leader`;
    default: {
      const unexpected: never = kind;
      return unexpected;
    }
  }
}

function confirmKindFor(source: BranchChangeableStatus): StatusConfirmKind {
  switch (source) {
    case "STK":
      return "display";
    case "DU":
      return "stock";
    default: {
      const unexpected: never = source;
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
  unreadByCode = {},
  unreadIds = [],
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
  const selectedIds = useMemo(
    () => new Set(selected.map((unit) => unit.id)),
    [selected],
  );
  const unreadIdSet = useMemo(() => new Set(unreadIds), [unreadIds]);
  const lockedStatus = selected[0]?.statusCode ?? null;
  const { eligible, selectAllStatus, selectAllTargets, pageHasBothStatuses } = useMemo(() => {
    const nextEligible = result.items.filter(
      (item) =>
        branchSerialSelectionBlock({
          serialNo: item.serialNumber.serialNo,
          statusCode: item.statusCode.code,
          pendingDefectInspection: item.pendingDefectInspection,
        }) === null,
    );
    const eligibleStatuses = new Set<BranchChangeableStatus>();
    for (const item of nextEligible) {
      const status = branchChangeableStatus(item.statusCode.code);
      if (status) eligibleStatuses.add(status);
    }
    const nextSelectAllStatus: BranchChangeableStatus | null =
      lockedStatus ?? (eligibleStatuses.size === 1 ? ([...eligibleStatuses][0] ?? null) : null);
    const nextTargets = nextSelectAllStatus
      ? nextEligible.filter((item) => item.statusCode.code === nextSelectAllStatus)
      : [];
    return {
      eligible: nextEligible,
      selectAllStatus: nextSelectAllStatus,
      selectAllTargets: nextTargets,
      pageHasBothStatuses: eligibleStatuses.has("STK") && eligibleStatuses.has("DU"),
    };
  }, [lockedStatus, result.items]);
  const allSelectAllSelected =
    selectAllTargets.length > 0 && selectAllTargets.every((item) => selectedIds.has(item.id));
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
    const byId = new Map(
      statusOptions
        .filter((option) => !isBranchInventoryV2HiddenStatus(option.code))
        .map((option) => [option.id, option]),
    );
    for (const item of result.items) {
      const status = item.statusCode;
      if (isBranchInventoryV2HiddenStatus(status.code) || byId.has(status.id)) continue;
      byId.set(status.id, { id: status.id, code: status.code, name: status.name });
    }
    return [...byId.values()];
  }, [result.items, statusOptions]);
  const selectedStatusCode = statusMenu.find((option) => option.id === statusCodeId)?.code;
  const noChangeableHint = branchInventoryChangeableHint({
    items: result.items.map((item) => ({ statusCode: item.statusCode.code })),
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
      limit?: number;
      offPlanogram?: boolean;
    }) =>
      branchInventoryV2Href({
        branchId,
        q: next.q,
        statusCodeId: next.statusCodeId,
        sku: next.sku,
        page: next.page,
        limit: next.limit ?? limit,
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
    const next = toSelected(item);
    if (!next) return;
    setSelected((current) => {
      if (current.some((unit) => unit.id === item.id)) {
        return current.filter((unit) => unit.id !== item.id);
      }
      const locked = current[0]?.statusCode;
      if (locked && locked !== next.statusCode) return current;
      return [...current, next];
    });
  }, []);

  function openChangeStatus() {
    const source = selected[0]?.statusCode;
    if (!source) return;
    if (selected.some((unit) => unit.statusCode !== source)) {
      toast.error("Select units that share the same status.");
      return;
    }
    setConfirmKind(confirmKindFor(source));
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

  function handlePageSizeChange(nextLimit: TablePageSize) {
    router.push(
      hrefFor({
        q: query.trim(),
        statusCodeId,
        sku,
        page: 1,
        limit: nextLimit,
      }),
      { scroll: false },
    );
  }

  async function applyConfirmed(kind: StatusConfirmKind, reason: string) {
    if (selected.length === 0) return;
    const source = selected[0]?.statusCode;
    if (!source || selected.some((unit) => unit.statusCode !== source)) {
      toast.error("Select units that share the same status.");
      return;
    }
    if (kind === "display" && source !== "STK") {
      toast.error("In-stock units can be marked as display units.");
      return;
    }
    if (kind === "stock" && source !== "DU") {
      toast.error("Display units can be returned to stock.");
      return;
    }
    if (kind === "defect" && reason.trim().length === 0) {
      toast.error("Describe the problem before sending");
      return;
    }
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
        case "stock": {
          const updated = await updateInventoryStatusAction(unit.id, "STK");
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
    } else {
      toast.success(confirmedMessage(kind, done));
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
          cell: ({ row }) => {
            const unread = unreadIdSet.has(row.original.id);
            return (
              <span className="inline-flex items-center gap-1.5">
                {unread ? (
                  <span
                    className="inline-block size-2 shrink-0 rounded-full bg-red-600"
                    role="img"
                    aria-label="Status changed since you last opened this unit"
                  />
                ) : null}
                <StatusCodeBadge
                  code={row.original.statusCode.code}
                  name={row.original.statusCode.name}
                  color={row.original.statusCode.color}
                  codeOnly
                />
              </span>
            );
          },
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
          checked={allSelectAllSelected}
          disabled={selectAllTargets.length === 0}
          aria-label={selectAllAriaLabel({
            status: selectAllStatus,
            targetCount: selectAllTargets.length,
            eligibleCount: eligible.length,
          })}
          onCheckedChange={(checked) => {
            if (checked === true) {
              setEligibleSelection(selectedUnits(selectAllTargets));
              return;
            }
            setEligibleSelection([]);
          }}
        />
      ),
      enableSorting: false,
      cell: ({ row }) => {
        const block = branchSerialSelectionBlock(
          {
            serialNo: row.original.serialNumber.serialNo,
            statusCode: row.original.statusCode.code,
            pendingDefectInspection: row.original.pendingDefectInspection,
          },
          lockedStatus,
        );
        const isSelected = selectedIds.has(row.original.id);
        const blockedLabel = block ? selectionBlockLabel(block) : null;
        return (
          <Checkbox
            checked={isSelected}
            disabled={block !== null}
            title={blockedLabel ?? undefined}
            aria-label={
              blockedLabel ?? `Select ${branchSerialLabel(row.original.serialNumber.serialNo)}`
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
    allSelectAllSelected,
    eligible,
    indexOffset,
    lockedStatus,
    selectAllStatus,
    selectAllTargets,
    selectedIds,
    setEligibleSelection,
    toggle,
    unreadIdSet,
  ]);

  const openDrawerChangeStatus = useCallback((item: InventoryListItem) => {
    const next = toSelected(item);
    if (!next) return;
    setSelected([next]);
    setConfirmKind(confirmKindFor(next.statusCode));
    setConfirmOpen(true);
  }, []);

  const handleMarkedRead = useCallback(() => {
    router.refresh();
  }, [router]);

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
        unreadByCode={unreadByCode}
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
              {selected.length} {lockedStatus} {selected.length === 1 ? "unit" : "units"} selected
            </span>
            {lockedStatus && selectAllTargets.length > 0 && !allSelectAllSelected ? (
              <button
                type="button"
                className="text-sm font-medium text-teal-800 underline-offset-4 hover:underline dark:text-teal-300"
                onClick={() => setSelected(selectedUnits(selectAllTargets))}
              >
                Select all {selectAllTargets.length} {lockedStatus} units
              </button>
            ) : null}
            {pageHasBothStatuses ? (
              <p className="w-full text-xs text-teal-900/80 dark:text-teal-100/80">
                In-stock and display units are changed separately.
              </p>
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
              onClick={() => openChangeStatus()}
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
        pageSize={{ value: limit, onChange: handlePageSizeChange }}
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
              <SelectTrigger aria-label="Filter by status" className="w-11rem">
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
                {result.total === 1 ? "unit" : "units"} · {eligible.length.toLocaleString()} can
                change status
              </p>
              <p>Select in-stock (STK) or display (DU) units. One status at a time.</p>
            </div>
          ) : null
        }
        banner={
          noChangeableHint ? (
            <p className="border-b px-4 py-3 text-sm text-muted-foreground" role="status">
              No in-stock or display units in this list. Only those units can change status.
            </p>
          ) : null
        }
      />

      <StatusConfirmDialog
        key={confirmOpen ? `open-${confirmKind}-${lockedStatus ?? "none"}` : "closed"}
        open={confirmOpen}
        initialKind={confirmKind}
        sourceStatus={lockedStatus ?? "STK"}
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
        onMarkedRead={handleMarkedRead}
      />
    </div>
  );
}
