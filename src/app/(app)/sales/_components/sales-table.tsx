"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { EditSaleHeaderDialog } from "@/app/(app)/sales/_components/edit-sale-header-dialog";
import { EditSaleSerialDialog } from "@/app/(app)/sales/_components/edit-sale-serial-dialog";
import { ProcessReturnDialog } from "@/app/(app)/sales/_components/process-return-dialog";
import {
  ReplacementFlowDialogs,
  type ReplacementFlowTarget,
} from "@/app/(app)/sales/_components/replacement-flow-dialogs";
import {
  SaleDetailsDialog,
  type SaleDetailsLine,
  type SaleDetailsPayload,
  type SaleReturnConfirmAction,
} from "@/app/(app)/sales/_components/sale-details-dialog";
import {
  SALE_RETURN_CONFIRM_COPY,
  type SaleReturnPendingConfirm,
} from "@/app/(app)/sales/_components/sale-return-confirm";
import {
  approveReturnAction,
  completeReturnRestoreAction,
  evaluateReturnAction,
  getSaleDetailsAction,
  rejectReturnAction,
  type SaleStatusCodeRef,
} from "@/features/sales/actions/sales.actions";
import { TO_FOLLOW_SERIAL_LABEL } from "@/features/sales/constants/to-follow-serial";
import { capturesDeliveryReceipt } from "@/features/sales/utils/delivery-method";
import {
  canEditSaleHeaderForLines,
  isOfficialSoldStatusCode,
} from "@/features/sales/utils/sale-header-edit";
import type { SalesActionCapabilities } from "@/features/sales/constants/sales-permissions";
import {
  TableAmountCell,
  TableCodeCell,
  TableEmptyRow,
  uniqueSearchSuggestions,
} from "@/components/data-table";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { usePersistedBoolean } from "@/hooks/use-persisted-boolean";
import { GlobalDataTable, GlobalTableHead, nextTableSort } from "@/lib/data-table";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { cn } from "@/utils/cn";
import { matchesTableSearch } from "@/utils/match-table-search";

/** One table row = one transaction detail (serial / TO-FOLLOW line). */
interface SaleRow {
  id: string;
  detailId: string;
  saleId: string;
  transactionNo: string;
  transactionDate: string | null;
  customerName: string | null;
  packageName: string | null;
  brandName: string | null;
  modelLabel: string | null;
  saleAmount: string;
  modelPrice: string | null;
  atrStatus: string;
  statusCode: SaleStatusCodeRef | null;
  branchId: string;
  branch: { id: string; name: string };
  serialNumberId: string | null;
  serialNumber: { id: string; serialNo: string } | null;
  returnRequest: { id: string; status: string } | null;
}

type EditingLine = {
  saleId: string;
  detailId: string;
  transactionNo: string;
  branchId: string;
  modelId: string | null;
  serialNumberId: string | null;
  serialNo: string;
  deliveryNo: string | null;
  deliveryDate: string | null;
  showDelivery: boolean;
};

type SalesSortField =
  | "transactionNo"
  | "date"
  | "branch"
  | "customer"
  | "amount"
  | "atrStatus"
  | "returnStatus";
type SalesSortDir = "asc" | "desc";

interface SalesTableProps {
  result: {
    items: SaleRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  capabilities: SalesActionCapabilities;
  initialSort?: string;
  initialSortDir?: string;
}

function saleTransactionLabel(sale: SaleRow): string {
  return sale.transactionNo || sale.saleId.slice(-8);
}

/** Null serial means TO-FOLLOW was encoded (placeholder pending a real unit). */
function saleSerialLabel(sale: SaleRow): string {
  return sale.serialNumber?.serialNo ?? TO_FOLLOW_SERIAL_LABEL;
}

function joinDetailParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p))
    .join(" · ");
}

/** TRN NO. cell — bold primary + muted secondary metadata (Official Sales Serial pattern). */
function TrnDetailCell({
  row,
  showAllColumns,
  className,
}: {
  row: SaleRow;
  showAllColumns: boolean;
  className?: string;
}) {
  const primary = saleTransactionLabel(row);
  const condensed = joinDetailParts([
    row.branch.name,
    row.brandName,
    row.modelLabel,
  ]);

  return (
    <TableCell className={cn("py-2 sm:py-2.5", className)}>
      <div className="min-w-0">
        <div className="font-mono text-sm font-semibold">{primary}</div>
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

function formatSaleDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function buildSalesHref(
  page: number,
  limit: number,
  sort?: string,
  sortDir?: string,
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));
  if (sort) params.set("sort", sort);
  if (sort && sortDir) params.set("dir", sortDir);
  const query = params.toString();
  return query ? `/sales?${query}` : "/sales";
}

/** Shared numeric ID per sale on this page (sibling serial lines reuse the same ID). */
function buildSaleIdMap(rows: SaleRow[]): Map<string, number> {
  const map = new Map<string, number>();
  let next = 1;
  for (const row of rows) {
    if (!map.has(row.saleId)) {
      map.set(row.saleId, next);
      next += 1;
    }
  }
  return map;
}

/** Compact: ID TRN DATE BRANCH CUSTOMER SN SALE STATUS ACTIONS */
const COMPACT_COL_COUNT = 9;
/** Extra when "Show all columns": PACKAGE BRAND MODEL MODEL PRICE */
const SECONDARY_COL_COUNT = 4;

/** Sticky left freeze — ID → TRN NO. */
const stickyHeadId =
  "sticky left-0 z-40 w-12 min-w-12 border-r border-border/60 bg-muted";
const stickyHeadTrn =
  "sticky left-12 z-40 min-w-[9rem] border-r border-border/60 bg-muted shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]";
const stickyCellId =
  "sticky left-0 z-10 w-12 min-w-12 border-r border-border/60";
const stickyCellTrn =
  "sticky left-12 z-10 min-w-[9rem] border-r border-border/60 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.06)]";

export function SalesTable({
  result,
  capabilities,
  initialSort = "",
  initialSortDir = "desc",
}: SalesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [showAllColumns, setShowAllColumns] = usePersistedBoolean(
    "isms.sales.showAllColumns",
  );
  const [pending, startTransition] = useTransition();
  const [editingLine, setEditingLine] = useState<EditingLine | null>(null);
  const [detailsSaleId, setDetailsSaleId] = useState<string | null>(null);
  const [saleDetails, setSaleDetails] = useState<SaleDetailsPayload | null>(null);
  const [headerEditSale, setHeaderEditSale] =
    useState<SaleDetailsPayload | null>(null);
  const [pendingConfirm, setPendingConfirm] =
    useState<SaleReturnPendingConfirm | null>(null);
  const [processReturnSale, setProcessReturnSale] =
    useState<SaleDetailsPayload | null>(null);
  const [replacementTarget, setReplacementTarget] =
    useState<ReplacementFlowTarget | null>(null);
  const pageSize = parseTablePageSize(result.limit);
  const colCount =
    COMPACT_COL_COUNT + (showAllColumns ? SECONDARY_COL_COUNT : 0);
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as SalesSortDir;

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(buildSalesHref(1, limit, sort, sort ? sortDir : undefined));
  }

  function toggleSort(field: SalesSortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(buildSalesHref(1, pageSize, next.sort, next.dir));
  }
  const filtered = useMemo(
    () =>
      result.items.filter((sale) =>
        matchesTableSearch(query, [
          sale.saleId,
          sale.transactionNo,
          sale.customerName,
          sale.packageName,
          sale.brandName,
          sale.modelLabel,
          sale.branch.name,
          sale.saleAmount,
          sale.modelPrice,
          saleSerialLabel(sale),
          sale.statusCode?.name,
          sale.statusCode?.code,
          sale.atrStatus,
          sale.returnRequest?.status,
        ]),
      ),
    [query, result.items],
  );
  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        result.items.map((sale) => sale.transactionNo),
        result.items.map((sale) => sale.branch.name),
        result.items.map((sale) => sale.customerName ?? ""),
        result.items.map((sale) => saleSerialLabel(sale)),
        result.items.map((sale) => sale.modelLabel ?? ""),
        result.items.map((sale) => sale.statusCode?.name ?? ""),
        result.items.map((sale) => sale.statusCode?.code ?? ""),
      ),
    [result.items],
  );
  const saleIdMap = useMemo(() => buildSaleIdMap(filtered), [filtered]);

  function refreshSaleDetails(saleId: string) {
    startTransition(async () => {
      const res = await getSaleDetailsAction(saleId);
      if ("error" in res) {
        toast.error(res.error);
        setDetailsSaleId(null);
        setSaleDetails(null);
        return;
      }
      setSaleDetails(res);
    });
  }

  function openSaleDetails(saleId: string) {
    setDetailsSaleId(saleId);
    setSaleDetails(null);
    refreshSaleDetails(saleId);
  }

  function handleEditLine(line: SaleDetailsLine) {
    if (!saleDetails) return;
    if (line.serialNumberId || line.serialNo !== TO_FOLLOW_SERIAL_LABEL) {
      toast.error("Only TO-FOLLOW sale lines can be edited");
      return;
    }
    setEditingLine({
      saleId: saleDetails.id,
      detailId: line.detailId,
      transactionNo: saleDetails.transactionNo,
      branchId: saleDetails.stockBranchId,
      modelId: line.modelId,
      serialNumberId: line.serialNumberId,
      serialNo: line.serialNo,
      deliveryNo: line.deliveryNo,
      deliveryDate: line.deliveryDate,
      showDelivery: capturesDeliveryReceipt(
        saleDetails.customerDeliveryMethod?.name,
      ),
    });
  }

  function openHeaderEdit(saleId: string) {
    startTransition(async () => {
      const res = await getSaleDetailsAction(saleId);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if (!canEditSaleHeaderForLines(res.lines)) {
        toast.error("Official Sold sales cannot have their header edited");
        return;
      }
      setHeaderEditSale(res);
    });
  }

  function handleReturnAction(action: SaleReturnConfirmAction) {
    if (!saleDetails) return;
    if (action === "request") {
      setProcessReturnSale(saleDetails);
      return;
    }
    if (action === "complete_replacement") {
      if (!saleDetails.returnRequest?.id) return;
      setReplacementTarget({
        returnRequestId: saleDetails.returnRequest.id,
        saleId: saleDetails.id,
        transactionNo: saleDetails.transactionNo,
        branchId: saleDetails.branchId,
        branchName: saleDetails.branch.name,
      });
      return;
    }
    setPendingConfirm({
      saleId: saleDetails.id,
      returnRequestId: saleDetails.returnRequest?.id,
      transactionNo: saleDetails.transactionNo,
      branchName: saleDetails.branch.name,
      action,
    });
  }

  function confirmPendingAction() {
    if (!pendingConfirm) return;
    const { action, returnRequestId, successMessage } = {
      ...pendingConfirm,
      successMessage: SALE_RETURN_CONFIRM_COPY[pendingConfirm.action].successMessage,
    };

    startTransition(async () => {
      let res: { error?: string; success?: boolean };

      switch (action) {
        case "request":
        case "complete_replacement":
          return;
        case "evaluate":
          if (!returnRequestId) return;
          res = await evaluateReturnAction(returnRequestId);
          break;
        case "approve":
          if (!returnRequestId) return;
          res = await approveReturnAction(returnRequestId);
          break;
        case "reject":
          if (!returnRequestId) return;
          res = await rejectReturnAction(returnRequestId);
          break;
        case "restore":
          if (!returnRequestId) return;
          res = await completeReturnRestoreAction(returnRequestId);
          break;
        default: {
          const _exhaustive: never = action;
          void _exhaustive;
          return;
        }
      }

      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(successMessage);
      setPendingConfirm(null);
      router.refresh();
      if (detailsSaleId) {
        const refreshed = await getSaleDetailsAction(detailsSaleId);
        if ("error" in refreshed) {
          setDetailsSaleId(null);
          setSaleDetails(null);
        } else {
          setSaleDetails(refreshed);
        }
      }
    });
  }

  const copy = pendingConfirm
    ? SALE_RETURN_CONFIRM_COPY[pendingConfirm.action]
    : null;

  return (
    <div className="space-y-4">
      <GlobalDataTable
        stickyHeader
        scrollable
        search={{ value: query, onChange: setQuery, placeholder: "Search sales…", suggestions }}
        toolbarActions={
          result.items.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowAllColumns((v) => !v)}
            >
              {showAllColumns ? "Fewer columns" : "Show all columns"}
            </Button>
          ) : null
        }
        pagination={{
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          itemLabel: "sale line",
          buildHref: (page) => buildSalesHref(page, pageSize, sort, sort ? sortDir : undefined),
        }}
        pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
      >
        <TableHeader>
          <TableRow>
            <GlobalTableHead className={stickyHeadId}>ID</GlobalTableHead>
            <GlobalTableHead
              sortKey="transactionNo"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as SalesSortField)}
              className={stickyHeadTrn}
            >
              TRN NO.
            </GlobalTableHead>
            <GlobalTableHead
              sortKey="date"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as SalesSortField)}
            >
              DATE
            </GlobalTableHead>
            <GlobalTableHead
              sortKey="branch"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as SalesSortField)}
            >
              BRANCH
            </GlobalTableHead>
            <GlobalTableHead
              sortKey="customer"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as SalesSortField)}
            >
              CUSTOMER
            </GlobalTableHead>
            {showAllColumns ? (
              <>
                <GlobalTableHead>PACKAGE</GlobalTableHead>
                <GlobalTableHead>BRAND</GlobalTableHead>
                <GlobalTableHead>MODEL</GlobalTableHead>
              </>
            ) : null}
            <GlobalTableHead>SN</GlobalTableHead>
            <GlobalTableHead
              sortKey="amount"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as SalesSortField)}
            >
              SALE
            </GlobalTableHead>
            {showAllColumns ? (
              <GlobalTableHead>MODEL PRICE</GlobalTableHead>
            ) : null}
            <GlobalTableHead>STATUS</GlobalTableHead>
            <GlobalTableHead className="w-48">ACTIONS</GlobalTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmptyRow
              colSpan={colCount}
              message="No results match your search."
            />
          ) : (
            filtered.map((s, index) => {
              const stripe = index % 2 === 1;
              const stickyBg = cn(
                stripe ? "bg-table-stripe" : "bg-card",
                "group-hover:bg-accent/60",
              );
              return (
                <TableRow
                  key={s.id}
                  className={cn("group", stripe && "bg-table-stripe")}
                >
                  <TableCell
                    className={cn(
                      stickyCellId,
                      stickyBg,
                      "py-2 tabular-nums text-muted-foreground sm:py-2.5",
                    )}
                  >
                    {saleIdMap.get(s.saleId) ?? "—"}
                  </TableCell>
                  <TrnDetailCell
                    row={s}
                    showAllColumns={showAllColumns}
                    className={cn(stickyCellTrn, stickyBg)}
                  />
                  <TableCell className="whitespace-nowrap py-2 tabular-nums sm:py-2.5">
                    {formatSaleDate(s.transactionDate)}
                  </TableCell>
                  <TableCell className="py-2 sm:py-2.5">{s.branch.name}</TableCell>
                  <TableCell className="py-2 sm:py-2.5">
                    {s.customerName?.trim() || "—"}
                  </TableCell>
                  {showAllColumns ? (
                    <>
                      <TableCell className="py-2 sm:py-2.5">
                        {s.packageName ?? "—"}
                      </TableCell>
                      <TableCell className="py-2 sm:py-2.5">
                        {s.brandName ?? "—"}
                      </TableCell>
                      <TableCell className="py-2 font-mono text-sm sm:py-2.5">
                        {s.modelLabel ?? "—"}
                      </TableCell>
                    </>
                  ) : null}
                  <TableCodeCell
                    value={saleSerialLabel(s)}
                    className="py-2 sm:py-2.5"
                  />
                  <TableAmountCell
                    value={s.saleAmount}
                    className="py-2 sm:py-2.5"
                  />
                  {showAllColumns ? (
                    s.modelPrice != null ? (
                      <TableAmountCell
                        value={s.modelPrice}
                        className="py-2 sm:py-2.5"
                      />
                    ) : (
                      <TableCell className="py-2 text-muted-foreground sm:py-2.5">
                        —
                      </TableCell>
                    )
                  ) : null}
                  <TableCell className="py-2 sm:py-2.5">
                    {s.statusCode ? (
                      <StatusCodeBadge
                        code={s.statusCode.code}
                        name={s.statusCode.name}
                        color={s.statusCode.color}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2 sm:py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => openSaleDetails(s.saleId)}
                      >
                        View details
                      </Button>
                      {capabilities.canUpdateSaleHeader &&
                      saleSerialLabel(s) === TO_FOLLOW_SERIAL_LABEL &&
                      !isOfficialSoldStatusCode(s.statusCode?.code) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => openHeaderEdit(s.saleId)}
                        >
                          Edit
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </GlobalDataTable>

      {detailsSaleId && saleDetails ? (
        <SaleDetailsDialog
          sale={saleDetails}
          open
          capabilities={capabilities}
          pending={pending}
          onEditLine={handleEditLine}
          onEditHeader={() => setHeaderEditSale(saleDetails)}
          onReturnAction={handleReturnAction}
          onOpenChange={(open) => {
            if (!open) {
              setDetailsSaleId(null);
              setSaleDetails(null);
            }
          }}
        />
      ) : null}

      {headerEditSale ? (
        <EditSaleHeaderDialog
          key={headerEditSale.id}
          sale={headerEditSale}
          open
          onOpenChange={(open) => {
            if (!open) setHeaderEditSale(null);
          }}
          onSaved={() => {
            const saleId = headerEditSale.id;
            setHeaderEditSale(null);
            router.refresh();
            if (detailsSaleId === saleId) {
              refreshSaleDetails(saleId);
            }
          }}
        />
      ) : null}

      {editingLine ? (
        <EditSaleSerialDialog
          key={editingLine.detailId}
          saleId={editingLine.saleId}
          detailId={editingLine.detailId}
          transactionNo={editingLine.transactionNo}
          branchId={editingLine.branchId}
          modelId={editingLine.modelId}
          currentSerialId={editingLine.serialNumberId}
          currentSerialLabel={editingLine.serialNo}
          currentDeliveryNo={editingLine.deliveryNo}
          currentDeliveryDate={editingLine.deliveryDate}
          showDelivery={editingLine.showDelivery}
          onClose={() => {
            const saleId = editingLine.saleId;
            setEditingLine(null);
            router.refresh();
            if (detailsSaleId === saleId) {
              refreshSaleDetails(saleId);
            }
          }}
        />
      ) : null}

      {processReturnSale ? (
        <ProcessReturnDialog
          sale={processReturnSale}
          open
          onOpenChange={(open) => {
            if (!open) setProcessReturnSale(null);
          }}
          onSubmitted={() => {
            const saleId = processReturnSale.id;
            setProcessReturnSale(null);
            router.refresh();
            if (detailsSaleId === saleId) {
              refreshSaleDetails(saleId);
            }
          }}
        />
      ) : null}

      <ReplacementFlowDialogs
        target={replacementTarget}
        onClose={() => setReplacementTarget(null)}
        onCompleted={() => {
          const saleId = replacementTarget?.saleId;
          setReplacementTarget(null);
          router.refresh();
          if (saleId && detailsSaleId === saleId) {
            refreshSaleDetails(saleId);
          }
        }}
      />

      <AlertDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setPendingConfirm(null);
          }
        }}
      >
        <AlertDialogContent className="z-60" overlayClassName="z-60">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {copy?.title ?? "Are you sure?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConfirm && copy ? (
                <>
                  {copy.description} Transaction{" "}
                  <span className="font-medium text-foreground">
                    {pendingConfirm.transactionNo}
                  </span>{" "}
                  at {pendingConfirm.branchName}.
                </>
              ) : (
                "Please confirm this action."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className={
                pendingConfirm?.action === "approve"
                  ? "bg-amber-600 text-white hover:bg-amber-700"
                  : pendingConfirm?.action === "restore"
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : undefined
              }
              onClick={(event) => {
                event.preventDefault();
                confirmPendingAction();
              }}
            >
              {pending ? "Working…" : (copy?.confirmLabel ?? "Confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
