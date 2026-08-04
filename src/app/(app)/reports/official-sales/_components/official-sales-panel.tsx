"use client";

import { useMemo, useRef, useState, useTransition } from "react";
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
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

/** Index + dealer template columns + Status + Result */
const BASE_COL_COUNT = 15;
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type DeleteTarget =
  | { mode: "single"; row: OfficialSalesStagingRow }
  | { mode: "bulk"; rowIds: string[] };

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

export function OfficialSalesPanel({ rows, canManage }: OfficialSalesPanelProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
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

  const colCount = BASE_COL_COUNT + (canManage ? 2 : 0);

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
    <>
      <GlobalDataTable
        stickyHeader
        scrollable
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search staging rows…",
          suggestions,
        }}
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
          canManage ? (
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
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={onDownloadTemplate}
              >
                Download Template
              </Button>
            </>
          ) : null
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
                  />
                ) : null}
                <TableIndexHead />
                <GlobalTableHead {...rowSort.sortProps("dealer")}>DEALER</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("brand")}>BRAND</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("branchSold")}>BRANCH NAME</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("drDate")}>DR DATE</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("drNo")}>DR NO.</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("itemModel")}>ITEM/MODEL</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("serial")}>SERIAL</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("saleAmount")}>SALE AMOUNT</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("drDate")}>DATE</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("drNo")}>SI/TRANS NO.</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("packageName")}>PACKAGE</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("action")}>ACTION KEY</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("status")}>Status</GlobalTableHead>
                <GlobalTableHead {...rowSort.sortProps("result")}>Result</GlobalTableHead>
                {canManage ? (
                  <GlobalTableHead className="w-[1%] text-right">Actions</GlobalTableHead>
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
                  return (
                    <TableRow
                      key={row.id}
                      data-state={
                        selection.isRowSelected(row.id) ? "selected" : undefined
                      }
                      className={cn(index % 2 === 1 && "bg-table-stripe")}
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
                        />
                      ) : null}
                      <TableIndexCell index={indexOffset + index + 1} />
                      <TableCell>{cellText(row.dealer)}</TableCell>
                      <TableCell>{cellText(row.brand)}</TableCell>
                      <TableCell>{cellText(row.branchSold)}</TableCell>
                      <TableCell className="tabular-nums">{cellText(row.drDate)}</TableCell>
                      <TableCell>{cellText(row.drNo)}</TableCell>
                      <TableCell>{cellText(row.itemModel)}</TableCell>
                      <TableCell className="font-mono text-sm">{row.serial}</TableCell>
                      <TableCell className="tabular-nums">{cellText(row.saleAmount)}</TableCell>
                      <TableCell className="tabular-nums">{cellText(row.drDate)}</TableCell>
                      <TableCell>{cellText(row.drNo)}</TableCell>
                      <TableCell>{cellText(row.packageName)}</TableCell>
                      <TableCell className="text-xs uppercase">{cellText(row.action)}</TableCell>
                      <TableCell>
                        <span className="text-xs uppercase text-muted-foreground">{row.status}</span>
                      </TableCell>
                      <TableCell className="max-w-xs text-sm text-muted-foreground">
                        {cellText(row.result)}
                      </TableCell>
                      {canManage ? (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            {row.status === "pending" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pending}
                                onClick={() => onProcess([row.id])}
                              >
                                Process
                              </Button>
                            ) : null}
                            {deletable ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                disabled={pending}
                                onClick={() => setDeleteTarget({ mode: "single", row })}
                              >
                                Delete
                              </Button>
                            ) : null}
                          </div>
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
    </>
  );
}
