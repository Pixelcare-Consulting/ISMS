"use client";

import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";
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
  ActionProgressDialog,
  runWithActionProgress,
  type ActionProgressState,
} from "@/components/ui/action-progress-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePersistedBoolean } from "@/hooks/use-persisted-boolean";
import {
  GlobalDataTable,
  GlobalTableHead,
  useClientTableSort,
} from "@/lib/data-table";
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

type WriteBusyAction = "upload" | "process" | "delete";

export interface OfficialSalesStagingRow {
  id: string;
  serial: string;
  drDate: string | null;
  drNo: string | null;
  siDate: string | null;
  siNo: string | null;
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

/** Default: # Serial Branch SI Date SI/Trans Action Status Result (+ checkbox/Actions when manage) */
const DEFAULT_COL_COUNT = 8;
/** Extra dealer-template columns when "Show all columns" is on — incl. the DR pair */
const SECONDARY_COL_COUNT = 7;
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
  processBusy,
  deleteBusy,
  onOpenChange,
  onProcess,
  onDelete,
}: {
  row: OfficialSalesStagingRow | null;
  open: boolean;
  processBusy: boolean;
  deleteBusy: boolean;
  onOpenChange: (open: boolean) => void;
  onProcess: (rowId: string) => void;
  onDelete: (row: OfficialSalesStagingRow) => void;
}) {
  if (!row) return null;

  const deletable = canDeleteStatus(row.status);
  const canProcess = row.status === "pending";
  const resultText = row.result?.trim() ? row.result : null;
  const actionsLocked = processBusy || deleteBusy;

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
            <DetailField label="Date" value={cellText(row.siDate)} />
            <DetailField label="SI/Trans No." value={cellText(row.siNo)} mono />
            <DetailField label="DR Date" value={cellText(row.drDate)} />
            <DetailField label="DR No." value={cellText(row.drNo)} mono />
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
              className="min-w-26"
              disabled={actionsLocked}
              onClick={() => onProcess(row.id)}
            >
              {processBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Processing…
                </>
              ) : (
                "Process"
              )}
            </Button>
          ) : null}
          {deletable ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={actionsLocked}
              onClick={() => onDelete(row)}
            >
              Delete
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={actionsLocked}
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
  const [showAllColumns, setShowAllColumns] = usePersistedBoolean(
    "isms.official-sales.showAllColumns",
  );
  const [detailRow, setDetailRow] = useState<OfficialSalesStagingRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  /** Download busy is independent so it never clears/blocks write actions. */
  const [isDownloading, setIsDownloading] = useState(false);
  /** Per write-action busy — avoids one global pending that freezes selection. */
  const [writeAction, setWriteAction] = useState<WriteBusyAction | null>(null);
  const [actionProgress, setActionProgress] =
    useState<ActionProgressState | null>(null);

  const isUploading = writeAction === "upload";
  const isProcessing = writeAction === "process";
  const isDeleting = writeAction === "delete";
  const writeBusy = writeAction !== null;
  const progressOpen = actionProgress !== null;

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesTableSearch(query, [
          row.dealer ?? "",
          row.brand ?? "",
          row.branchSold ?? "",
          row.drDate ?? "",
          row.drNo ?? "",
          row.siDate ?? "",
          row.siNo ?? "",
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
        rows.map((r) => r.siNo),
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
    siDate: (r) => r.siDate,
    siNo: (r) => r.siNo,
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

  const pendingRowCount = useMemo(
    () => rows.filter((row) => row.status === "pending").length,
    [rows],
  );

  async function onUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file || writeBusy || progressOpen) return;
    const formData = new FormData();
    formData.set("file", file);
    setWriteAction("upload");
    const outcome = await runWithActionProgress(setActionProgress, {
      title: "Uploading sales",
      description: "Staging your file. Steps update while the upload runs.",
      steps: [
        {
          id: "read",
          label: "Reading file",
          hint: "Sending the workbook to the server…",
        },
        {
          id: "validate",
          label: "Validating rows",
          hint: "Checking required columns and values…",
        },
        {
          id: "save",
          label: "Saving to staging",
          hint: "Writing validated rows…",
        },
        { id: "done", label: "Done" },
      ],
      run: () => uploadOfficialSalesAction(formData),
      getError: (result) =>
        "error" in result && result.error ? result.error : null,
      getSuccessSummary: (result) =>
        "rowCount" in result ? `Uploaded ${result.rowCount} row(s)` : "Uploaded",
      mapSuccessSteps: (steps, result) =>
        "rowCount" in result
          ? steps.map((step) =>
              step.id === "save"
                ? {
                    ...step,
                    label: `Saving to staging (${result.rowCount} row${result.rowCount === 1 ? "" : "s"})`,
                  }
                : step.id === "done"
                  ? { ...step, label: "Done" }
                  : step,
            )
          : steps,
    });
    setWriteAction(null);
    if (!outcome.ok) return;
    if (!("rowCount" in outcome.result)) return;
    if (fileRef.current) fileRef.current.value = "";
    toast.success(`Uploaded ${outcome.result.rowCount} row(s)`);
    router.refresh();
  }

  async function onDownloadTemplate() {
    if (isDownloading || writeBusy || progressOpen) return;
    setIsDownloading(true);
    const outcome = await runWithActionProgress(setActionProgress, {
      title: "Downloading template",
      description: "Preparing the dealer sales template.",
      stepIntervalMs: 500,
      autoCloseMs: 900,
      steps: [
        {
          id: "build",
          label: "Building workbook",
          hint: "Generating the Excel template…",
        },
        {
          id: "prepare",
          label: "Preparing download",
          hint: "Getting the file ready…",
        },
        { id: "done", label: "Done" },
      ],
      run: async () => {
        const base64 = await downloadOfficialSalesTemplateAction();
        downloadWorkbook(base64, "official-sales-template.xlsx");
        return true;
      },
      getSuccessSummary: () => "Template ready",
    });
    setIsDownloading(false);
    if (!outcome.ok) return;
    toast.success("Template downloaded");
  }

  async function onProcess(rowIds?: string[]) {
    if (writeBusy || progressOpen) return;
    const targetCount = rowIds?.length ?? pendingRowCount;
    const processingLabel =
      targetCount > 0
        ? targetCount === 1
          ? "Processing 1 row"
          : `Processing ${targetCount} rows`
        : "Processing pending rows";
    setWriteAction("process");
    const outcome = await runWithActionProgress(setActionProgress, {
      title: "Processing pending",
      description:
        targetCount > 0
          ? `Working through ${targetCount} staged row${targetCount === 1 ? "" : "s"}.`
          : "Working through pending staged rows.",
      steps: [
        {
          id: "prepare",
          label: "Preparing",
          hint: "Gathering pending staging rows…",
        },
        {
          id: "process",
          label: processingLabel,
          hint: "Applying sales updates…",
        },
        {
          id: "statuses",
          label: "Updating statuses",
          hint: "Saving success and failure results…",
        },
        { id: "done", label: "Done" },
      ],
      // The action processes a bounded batch and reports whether more is pending;
      // processed rows leave the pending queue, so repeating the call walks it.
      run: async () => {
        const input = rowIds?.length ? { rowIds } : undefined;
        let processed = 0;
        let successCount = 0;
        let errorCount = 0;
        const messages: string[] = [];

        for (;;) {
          const batch = await processOfficialSalesAction(input);
          if ("error" in batch) {
            // Earlier batches are already committed — surface what got through.
            if (processed === 0) return batch;
            return {
              ...batch,
              error: `${batch.error} Stopped after ${processed} row${processed === 1 ? "" : "s"}.`,
            };
          }

          processed += batch.processed;
          successCount += batch.successCount;
          errorCount += batch.errorCount;
          // Keep only the batch messages that name failed serials — the counts are
          // re-derived from the running totals below.
          if (batch.message?.includes("Failed:")) {
            messages.push(batch.message.slice(batch.message.indexOf("Failed:")));
          }

          if (!batch.remaining) {
            const summary = `Processed ${processed}: ${successCount} ok, ${errorCount} failed`;
            return {
              ...batch,
              processed,
              successCount,
              errorCount,
              message:
                messages.length > 0 ? `${summary}. ${messages.join(" ")}` : summary,
            };
          }
        }
      },
      getError: (result) =>
        "error" in result && result.error ? result.error : null,
      getSuccessSummary: (result) =>
        "message" in result && typeof result.message === "string" && result.message
          ? result.message
          : "processed" in result && "successCount" in result
            ? `${result.successCount} ok, ${result.errorCount} failed`
            : "Processed",
      mapSuccessSteps: (steps, result) => {
        if (!("processed" in result) || !("successCount" in result)) {
          return steps;
        }
        return steps.map((step) => {
          if (step.id === "process") {
            return {
              ...step,
              label:
                result.processed === 1
                  ? "Processed 1 row"
                  : `Processed ${result.processed} rows`,
            };
          }
          if (step.id === "statuses") {
            return {
              ...step,
              label: `Updating statuses (${result.successCount} ok, ${result.errorCount} failed)`,
            };
          }
          if (step.id === "done") return { ...step, label: "Done" };
          return step;
        });
      },
    });
    setWriteAction(null);
    if (!outcome.ok) return;
    if (
      !("processed" in outcome.result) ||
      !("successCount" in outcome.result)
    ) {
      return;
    }
    setDetailRow(null);
    const processMessage =
      "message" in outcome.result &&
      typeof outcome.result.message === "string" &&
      outcome.result.message
        ? outcome.result.message
        : `Processed ${outcome.result.processed}: ${outcome.result.successCount} ok, ${outcome.result.errorCount} failed`;
    if (outcome.result.errorCount > 0) {
      toast.warning(processMessage);
    } else {
      toast.success(processMessage);
    }
    router.refresh();
  }

  async function onDeleteConfirm() {
    if (!deleteTarget || writeBusy) return;
    const rowIds =
      deleteTarget.mode === "single" ? [deleteTarget.row.id] : deleteTarget.rowIds;
    if (rowIds.length === 0) return;

    setWriteAction("delete");
    try {
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setWriteAction(null);
    }
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
              className="min-w-38"
              disabled={isDownloading || writeBusy || progressOpen}
              onClick={() => void onDownloadTemplate()}
            >
              {isDownloading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Downloading…
                </>
              ) : (
                "Download Template"
              )}
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
                  className="min-w-30 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={writeBusy || selectedDeletableIds.length === 0}
                  onClick={() =>
                    setDeleteTarget({ mode: "bulk", rowIds: selectedDeletableIds })
                  }
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    "Delete selected"
                  )}
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
                  disabled={writeBusy || progressOpen}
                  onChange={(e) => void onUpload(e.target.files)}
                />
                <Button
                  type="button"
                  className="min-w-34"
                  disabled={writeBusy || progressOpen}
                  onClick={() => fileRef.current?.click()}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    "Upload sales"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-36"
                  disabled={writeBusy || progressOpen || pendingRowCount === 0}
                  onClick={() => void onProcess()}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    "Process pending"
                  )}
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
                <GlobalTableHead {...rowSort.sortProps("siDate")}>Date</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("siNo")}>SI/Trans No.</GlobalTableHead>
                {showAllColumns ? (
                  <>
                    <GlobalTableHead {...rowSort.sortProps("drDate")}>DR Date</GlobalTableHead>
                    <GlobalTableHead {...rowSort.sortProps("drNo")}>DR No.</GlobalTableHead>
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
                        {cellText(row.siDate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2 sm:py-2.5">
                        {cellText(row.siNo)}
                      </TableCell>
                      {showAllColumns ? (
                        <>
                          <TableCell className="whitespace-nowrap py-2 tabular-nums sm:py-2.5">
                            {cellText(row.drDate)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-2 sm:py-2.5">
                            {cellText(row.drNo)}
                          </TableCell>
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
        processBusy={isProcessing}
        deleteBusy={isDeleting}
        onOpenChange={(open) => {
          if (!open && !isProcessing && !isDeleting) setDetailRow(null);
        }}
        onProcess={(rowId) => void onProcess([rowId])}
        onDelete={(row) => {
          setDetailRow(null);
          setDeleteTarget({ mode: "single", row });
        }}
      />

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteTarget(null);
        }}
        title={
          deleteTarget?.mode === "bulk"
            ? "Delete selected staging rows?"
            : "Delete staging row?"
        }
        description={deleteDescription}
        pending={isDeleting}
        onConfirm={() => void onDeleteConfirm()}
      />

      <ActionProgressDialog
        state={actionProgress}
        onClose={() => setActionProgress(null)}
      />
    </TooltipProvider>
  );
}
