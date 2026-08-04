"use client";

import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  deleteOfficialSalesRowsAction,
  downloadOfficialSalesTemplateAction,
  processOfficialSalesAction,
  uploadOfficialSalesAction,
} from "@/features/official-sales/actions/official-sales.actions";
import {
  DeleteConfirmDialog,
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowCheckbox,
  TableSelectAllCheckbox,
  TableSelectionBadge,
  TableStatusBadge,
  uniqueSearchSuggestions,
  useClientTablePagination,
  useTableSelection,
} from "@/components/data-table";
import {
  GlobalDataTable,
  GlobalTableHead,
  useClientTableSort,
} from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils/cn";
import { matchesTableSearch } from "@/utils/match-table-search";

export interface OfficialSalesStagingRow {
  id: string;
  serial: string;
  drDate: string | null;
  drNo: string | null;
  branchSold: string | null;
  action: string | null;
  dealer: string | null;
  brand: string | null;
  itemModel: string | null;
  saleAmount: string | null;
  packageName: string | null;
  result: string | null;
  status: "pending" | "success" | "error";
  processedAt: string | null;
  batchFileName: string | null;
  createdAt: string;
}

interface OfficialSalesPanelProps {
  rows: OfficialSalesStagingRow[];
  canManage: boolean;
}

/** Default: # Serial Branch Date SI/Trans Action Status Result (+ checkbox/Actions when manage) */
const DEFAULT_COL_COUNT = 8;
/** Extra dealer-template columns when "Show all columns" is on */
const SECONDARY_COL_COUNT = 5;
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type DeleteTarget =
  | { mode: "single"; row: OfficialSalesStagingRow }
  | { mode: "bulk"; rowIds: string[] };

const STATUS_VARIANT_MAP = {
  pending: "secondary",
  success: "default",
  error: "destructive",
} as const;

/** Sticky left freeze — checkbox → # → Serial (manage mode). */
const stickyHeadCheckbox =
  "sticky left-0 top-[var(--sticky-toolbar-height,0px)] z-40 w-10 min-w-10 border-r border-border/60 bg-muted";
const stickyHeadIndexManage =
  "sticky left-10 z-40 w-12 min-w-12 border-r border-border/60 bg-muted text-center";
const stickyHeadSerialManage =
  "sticky left-[5.5rem] z-40 min-w-[9rem] border-r border-border/60 bg-muted shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]";
const stickyHeadIndexSolo =
  "sticky left-0 z-40 w-12 min-w-12 border-r border-border/60 bg-muted text-center";
const stickyHeadSerialSolo =
  "sticky left-12 z-40 min-w-[9rem] border-r border-border/60 bg-muted shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]";

const stickyCellCheckbox =
  "sticky left-0 z-10 w-10 min-w-10 border-r border-border/60";
const stickyCellIndexManage =
  "sticky left-10 z-10 w-12 min-w-12 border-r border-border/60";
const stickyCellSerialManage =
  "sticky left-[5.5rem] z-10 min-w-[9rem] border-r border-border/60 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.06)]";
const stickyCellIndexSolo =
  "sticky left-0 z-10 w-12 min-w-12 border-r border-border/60";
const stickyCellSerialSolo =
  "sticky left-12 z-10 min-w-[9rem] border-r border-border/60 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.06)]";

/** Turn the base64 workbook from the server action into a file download. */
function downloadWorkbook(base64: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function canDeleteStatus(status: OfficialSalesStagingRow["status"]): boolean {
  return status === "pending" || status === "error";
}

function cellText(value: string | null | undefined): string {
  return value && value.length > 0 ? value : "—";
}

function joinDetailParts(parts: Array<string | null | undefined>): string {
  return parts.map((p) => p?.trim()).filter((p): p is string => Boolean(p)).join(" · ");
}

function DetailField({
  label,
  value,
  mono,
  className,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <dt className="shrink-0 pt-0.5 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right wrap-break-word",
          mono && "font-mono text-xs sm:text-sm",
        )}
      >
        {children ?? value}
      </dd>
    </div>
  );
}

function SerialDetailCell({
  row,
  showAllColumns,
  className,
}: {
  row: OfficialSalesStagingRow;
  showAllColumns: boolean;
  className?: string;
}) {
  const primaryDetail = joinDetailParts([row.dealer, row.brand, row.itemModel]);
  const amountPackage = joinDetailParts([row.saleAmount, row.packageName]);
  const condensed = joinDetailParts([primaryDetail || null, amountPackage || null]);

  return (
    <TableCell className={cn("py-2 sm:py-2.5", className)}>
      <div className="min-w-0">
        <div className="font-mono text-sm font-medium">{row.serial}</div>
        {!showAllColumns && condensed ? (
          <p
            className="mt-0.5 max-w-40 truncate text-xs text-muted-foreground sm:max-w-56"
            title={condensed}
          >
            {condensed}
          </p>
        ) : null}
      </div>
    </TableCell>
  );
}

function ResultCell({ result }: { result: string | null }) {
  const full = result && result.length > 0 ? result : null;

  if (!full) {
    return (
      <TableCell className="max-w-36 py-2 text-sm text-muted-foreground sm:max-w-48 sm:py-2.5">
        —
      </TableCell>
    );
  }

  return (
    <TableCell className="max-w-36 py-2 sm:max-w-48 sm:py-2.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="block max-w-36 cursor-default truncate text-sm text-muted-foreground sm:max-w-48"
            title={full}
          >
            {full}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap">
          {full}
        </TooltipContent>
      </Tooltip>
    </TableCell>
  );
}

function StagingRowDetailsDialog({
  row,
  open,
  pending,
  onOpenChange,
  onProcess,
  onDelete,
}: {
  row: OfficialSalesStagingRow | null;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onProcess: (rowId: string) => void;
  onDelete: (row: OfficialSalesStagingRow) => void;
}) {
  if (!row) return null;

  const deletable = canDeleteStatus(row.status);
  const canProcess = row.status === "pending";
  const resultText = row.result?.trim() ? row.result : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] w-[min(calc(100vw-2rem),36rem)] max-w-xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0 pr-8 text-left">
          <DialogTitle>Staging details</DialogTitle>
          <DialogDescription>
            Review sale fields for serial{" "}
            <span className="font-mono text-foreground">{row.serial}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <dl className="grid shrink-0 grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
            <DetailField label="Serial" value={row.serial} mono />
            <DetailField label="Branch" value={cellText(row.branchSold)} />
            <DetailField label="Date" value={cellText(row.drDate)} />
            <DetailField label="SI/Trans No." value={cellText(row.drNo)} mono />
            <DetailField
              label="Action"
              value={cellText(row.action).toUpperCase()}
            />
            <DetailField label="Status">
              <TableStatusBadge
                status={row.status}
                variantMap={STATUS_VARIANT_MAP}
                className="capitalize"
              />
            </DetailField>
            <DetailField label="Dealer" value={cellText(row.dealer)} />
            <DetailField label="Brand" value={cellText(row.brand)} />
            <DetailField label="Item/Model" value={cellText(row.itemModel)} />
            <DetailField label="Sale Amount" value={cellText(row.saleAmount)} />
            <DetailField label="Package" value={cellText(row.packageName)} />
          </dl>

          <div className="shrink-0 space-y-1.5">
            <p className="text-sm text-muted-foreground">Result</p>
            <p
              className={cn(
                "rounded-md border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap wrap-break-word",
                !resultText && "text-muted-foreground",
              )}
            >
              {resultText ?? "No result yet."}
            </p>
          </div>
        </div>

        <DialogFooter className="mt-1 shrink-0 gap-2 border-t pt-3 sm:justify-end">
          {canProcess ? (
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => onProcess(row.id)}
            >
              Process
            </Button>
          ) : null}
          {deletable ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => onDelete(row)}
            >
              Delete
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OfficialSalesPanel({ rows, canManage }: OfficialSalesPanelProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [detailRow, setDetailRow] = useState<OfficialSalesStagingRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesTableSearch(query, [
          row.dealer ?? "",
          row.brand ?? "",
          row.branchSold ?? "",
          row.drDate ?? "",
          row.drNo ?? "",
          row.itemModel ?? "",
          row.serial,
          row.saleAmount ?? "",
          row.packageName ?? "",
          row.action ?? "",
          row.result ?? "",
          row.status,
        ]),
      ),
    [rows, query],
  );

  const selectableIds = useMemo(
    () => filtered.filter((row) => canDeleteStatus(row.status)).map((row) => row.id),
    [filtered],
  );
  const selectableIdSet = useMemo(() => new Set(selectableIds), [selectableIds]);
  const selection = useTableSelection(selectableIds);

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        rows.map((r) => r.serial),
        rows.map((r) => r.drNo),
        rows.map((r) => r.branchSold),
        rows.map((r) => r.dealer),
        rows.map((r) => r.brand),
      ),
    [rows],
  );

  const rowSort = useClientTableSort(filtered, {
    dealer: (r) => r.dealer,
    brand: (r) => r.brand,
    branchSold: (r) => r.branchSold,
    drDate: (r) => r.drDate,
    drNo: (r) => r.drNo,
    itemModel: (r) => r.itemModel,
    serial: (r) => r.serial,
    saleAmount: (r) => r.saleAmount,
    packageName: (r) => r.packageName,
    action: (r) => r.action,
    status: (r) => r.status,
    result: (r) => r.result,
  });

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
    indexOffset,
  } = useClientTablePagination(rowSort.sorted, {
    resetKey: `${query}:${rowSort.sortKey}:${rowSort.sortDir}`,
  });

  const colCount =
    DEFAULT_COL_COUNT +
    (showAllColumns ? SECONDARY_COL_COUNT : 0) +
    (canManage ? 2 : 0);

  const selectedDeletableIds = useMemo(
    () => selection.selectedIds.filter((id) => selectableIdSet.has(id)),
    [selection.selectedIds, selectableIdSet],
  );

  function onUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await uploadOfficialSalesAction(formData);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if (!("rowCount" in result)) return;
      toast.success(`Uploaded ${result.rowCount} row(s)`);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  function onDownloadTemplate() {
    startTransition(async () => {
      try {
        const base64 = await downloadOfficialSalesTemplateAction();
        downloadWorkbook(base64, "official-sales-template.xlsx");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not download template");
      }
    });
  }

  function onProcess(rowIds?: string[]) {
    startTransition(async () => {
      const result = await processOfficialSalesAction(
        rowIds?.length ? { rowIds } : undefined,
      );
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if (!("processed" in result) || !("successCount" in result)) return;
      setDetailRow(null);
      toast.success(
        `Processed ${result.processed}: ${result.successCount} ok, ${result.errorCount} failed`,
      );
      router.refresh();
    });
  }

  function onDeleteConfirm() {
    if (!deleteTarget) return;
    const rowIds =
      deleteTarget.mode === "single" ? [deleteTarget.row.id] : deleteTarget.rowIds;
    if (rowIds.length === 0) return;

    startTransition(async () => {
      const result = await deleteOfficialSalesRowsAction({ rowIds });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if (!("deleted" in result)) return;
      setDeleteTarget(null);
      setDetailRow(null);
      selection.clearSelection();
      toast.success(`Deleted ${result.deleted} row(s)`);
      router.refresh();
    });
  }

  const deleteDescription =
    deleteTarget?.mode === "single"
      ? `Delete staging row for serial ${deleteTarget.row.serial}? This only removes rows that have not been successfully processed.`
      : deleteTarget?.mode === "bulk"
        ? `Delete ${deleteTarget.rowIds.length} selected staging row${deleteTarget.rowIds.length === 1 ? "" : "s"}? Only pending and failed rows can be removed — successfully processed rows stay protected.`
        : "";

  return (
    <TooltipProvider delayDuration={300}>
      <GlobalDataTable
        stickyHeader
        scrollable
        className="min-w-0"
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search staging rows…",
          suggestions,
        }}
        searchTrailing={
          canManage ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={onDownloadTemplate}
            >
              Download Template
            </Button>
          ) : null
        }
        toolbarLeading={
          canManage ? (
            <TableSelectionBadge
              count={selection.selectedCount}
              onClear={selection.clearSelection}
              actions={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={pending || selectedDeletableIds.length === 0}
                  onClick={() =>
                    setDeleteTarget({ mode: "bulk", rowIds: selectedDeletableIds })
                  }
                >
                  Delete selected
                </Button>
              }
            />
          ) : null
        }
        toolbarActions={
          <>
            {rows.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setShowAllColumns((v) => !v)}
              >
                {showAllColumns ? "Fewer columns" : "Show all columns"}
              </Button>
            ) : null}
            {canManage ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => onUpload(e.target.files)}
                />
                <Button type="button" disabled={pending} onClick={() => fileRef.current?.click()}>
                  Upload sales
                </Button>
                <Button type="button" variant="outline" disabled={pending} onClick={() => onProcess()}>
                  Process pending
                </Button>
              </>
            ) : null}
          </>
        }
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={
          rows.length > 0
            ? {
                total,
                page,
                totalPages,
                itemLabel: "row",
                onPageChange: setPage,
              }
            : undefined
        }
        footer={
          rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No staged rows yet. Download the template, then upload an Excel or CSV file to
              stage sales.
            </p>
          ) : null
        }
      >
        {rows.length > 0 ? (
          <>
            <TableHeader>
              <TableRow>
                {canManage ? (
                  <TableSelectAllCheckbox
                    isAllSelected={selection.isAllSelected}
                    isPartiallySelected={selection.isPartiallySelected}
                    onToggleAll={selection.toggleAll}
                    aria-label="Select all deletable staging rows"
                    className={stickyHeadCheckbox}
                  />
                ) : null}
                <TableIndexHead
                  className={canManage ? stickyHeadIndexManage : stickyHeadIndexSolo}
                />
                <GlobalTableHead
                  {...rowSort.sortProps("serial")}
                  className={canManage ? stickyHeadSerialManage : stickyHeadSerialSolo}
                >
                  Serial
                </GlobalTableHead>
                {showAllColumns ? (
                  <>
                    <GlobalTableHead {...rowSort.sortProps("dealer")}>Dealer</GlobalTableHead>
                    <GlobalTableHead {...rowSort.sortProps("brand")}>Brand</GlobalTableHead>
                  </>
                ) : null}
                <GlobalTableHead {...rowSort.sortProps("branchSold")}>Branch</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("drDate")}>Date</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("drNo")}>SI/Trans No.</GlobalTableHead>
                {showAllColumns ? (
                  <>
                    <GlobalTableHead {...rowSort.sortProps("itemModel")}>
                      Item/Model
                    </GlobalTableHead>
                    <GlobalTableHead {...rowSort.sortProps("saleAmount")}>
                      Sale Amount
                    </GlobalTableHead>
                    <GlobalTableHead {...rowSort.sortProps("packageName")}>
                      Package
                    </GlobalTableHead>
                  </>
                ) : null}
                <GlobalTableHead {...rowSort.sortProps("action")}>Action</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("status")}>Status</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("result")}>Result</GlobalTableHead>
                {canManage ? (
                  <GlobalTableHead className="w-[1%] whitespace-nowrap text-right">
                    Actions
                  </GlobalTableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow
                  colSpan={colCount}
                  message="No results match your search."
                />
              ) : (
                pageItems.map((row, index) => {
                  const deletable = canDeleteStatus(row.status);
                  const stripe = index % 2 === 1;
                  const stickyBg = cn(
                    stripe ? "bg-table-stripe" : "bg-card",
                    "group-data-[state=selected]:bg-accent",
                    "group-hover:bg-accent/60",
                  );
                  return (
                    <TableRow
                      key={row.id}
                      data-state={
                        selection.isRowSelected(row.id) ? "selected" : undefined
                      }
                      className={cn("group", stripe && "bg-table-stripe")}
                    >
                      {canManage ? (
                        <TableRowCheckbox
                          checked={selection.isRowSelected(row.id)}
                          disabled={!deletable}
                          onCheckedChange={(checked) => {
                            if (!deletable) return;
                            selection.toggleRow(row.id, checked);
                          }}
                          aria-label={
                            deletable
                              ? `Select staging row ${row.serial}`
                              : `Processed row ${row.serial} cannot be selected`
                          }
                          className={cn(stickyCellCheckbox, stickyBg)}
                        />
                      ) : null}
                      <TableIndexCell
                        index={indexOffset + index + 1}
                        className={cn(
                          canManage ? stickyCellIndexManage : stickyCellIndexSolo,
                          stickyBg,
                        )}
                      />
                      <SerialDetailCell
                        row={row}
                        showAllColumns={showAllColumns}
                        className={cn(
                          canManage ? stickyCellSerialManage : stickyCellSerialSolo,
                          stickyBg,
                        )}
                      />
                      {showAllColumns ? (
                        <>
                          <TableCell className="py-2 sm:py-2.5">
                            {cellText(row.dealer)}
                          </TableCell>
                          <TableCell className="py-2 sm:py-2.5">
                            {cellText(row.brand)}
                          </TableCell>
                        </>
                      ) : null}
                      <TableCell className="py-2 sm:py-2.5">
                        {cellText(row.branchSold)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2 tabular-nums sm:py-2.5">
                        {cellText(row.drDate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2 sm:py-2.5">
                        {cellText(row.drNo)}
                      </TableCell>
                      {showAllColumns ? (
                        <>
                          <TableCell className="py-2 sm:py-2.5">
                            {cellText(row.itemModel)}
                          </TableCell>
                          <TableCell className="py-2 tabular-nums sm:py-2.5">
                            {cellText(row.saleAmount)}
                          </TableCell>
                          <TableCell className="py-2 sm:py-2.5">
                            {cellText(row.packageName)}
                          </TableCell>
                        </>
                      ) : null}
                      <TableCell className="py-2 text-xs uppercase sm:py-2.5">
                        {cellText(row.action)}
                      </TableCell>
                      <TableCell className="py-2 sm:py-2.5">
                        <TableStatusBadge
                          status={row.status}
                          variantMap={STATUS_VARIANT_MAP}
                          className="capitalize"
                        />
                      </TableCell>
                      <ResultCell result={row.result} />
                      {canManage ? (
                        <TableCell className="py-2 text-right sm:py-2.5">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => setDetailRow(row)}
                          >
                            View
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </>
        ) : null}
      </GlobalDataTable>

      <StagingRowDetailsDialog
        row={detailRow}
        open={detailRow !== null}
        pending={pending}
        onOpenChange={(open) => {
          if (!open) setDetailRow(null);
        }}
        onProcess={(rowId) => onProcess([rowId])}
        onDelete={(row) => {
          setDetailRow(null);
          setDeleteTarget({ mode: "single", row });
        }}
      />

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={
          deleteTarget?.mode === "bulk"
            ? "Delete selected staging rows?"
            : "Delete staging row?"
        }
        description={deleteDescription}
        pending={pending}
        onConfirm={onDeleteConfirm}
      />
    </TooltipProvider>
  );
}
