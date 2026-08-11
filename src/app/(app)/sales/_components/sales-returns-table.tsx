"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { EditSaleHeaderDialog } from "@/app/(app)/sales/_components/edit-sale-header-dialog";
import { EditSaleSerialDialog } from "@/app/(app)/sales/_components/edit-sale-serial-dialog";
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
  requestReturnAction,
  type SaleStatusCodeRef,
} from "@/features/sales/actions/sales.actions";
import type { SalesActionCapabilities } from "@/features/sales/constants/sales-permissions";
import { TO_FOLLOW_SERIAL_LABEL } from "@/features/sales/constants/to-follow-serial";
import { capturesDeliveryReceipt } from "@/features/sales/utils/delivery-method";
import {
  TableAmountCell,
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
import { Label } from "@/components/ui/label";
import { TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { usePersistedBoolean } from "@/hooks/use-persisted-boolean";
import { Textarea } from "@/components/ui/textarea";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { GlobalDataTable, GlobalTableHead, nextTableSort } from "@/lib/data-table";
import { cn } from "@/utils/cn";
import { formatPeso } from "@/utils/format-currency";
import { matchesTableSearch } from "@/utils/match-table-search";

interface ReturnRow {
  id: string;
  returnRequestId: string;
  saleId: string;
  transactionNo: string;
  transactionDate: string | null;
  customerName: string | null;
  amount: string;
  atrStatus: string;
  atrStatusCode: SaleStatusCodeRef;
  returnStatus: string;
  returnStatusCode: SaleStatusCodeRef;
  requestNotes: string | null;
  createdAt: string;
  branch: { id: string; name: string };
}

type ReturnsSortField =
  | "transactionNo"
  | "date"
  | "branch"
  | "customer"
  | "amount"
  | "atrStatus"
  | "returnStatus"
  | "createdAt";
type ReturnsSortDir = "asc" | "desc";

interface SalesReturnsTableProps {
  result: {
    items: ReturnRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  /** Return workflow + optional sale edit caps (from Sales or Returns resolvers). */
  capabilities: Pick<
    SalesActionCapabilities,
    | "canUpdateSaleHeader"
    | "canCreateSale"
    | "canRequestReturn"
    | "canEvaluateReturn"
    | "canApproveReturn"
    | "canCompleteReturn"
  >;
  initialSort?: string;
  initialSortDir?: string;
  /** URL tab value for pagination links (default branch). */
  listTab?: "branch" | "approvals";
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

/** Compact: TRN NO. DATE BRANCH CUSTOMER RETURN STATUS ACTIONS */
const COMPACT_COL_COUNT = 6;
/** Extra when "Show all columns": AMOUNT ATR NOTES */
const SECONDARY_COL_COUNT = 3;

function joinDetailParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p))
    .join(" · ");
}

function returnTransactionLabel(row: ReturnRow): string {
  return row.transactionNo || row.saleId.slice(-8);
}

function parseReturnAmount(value: string): number | null {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function TrnDetailCell({
  row,
  showAllColumns,
  className,
}: {
  row: ReturnRow;
  showAllColumns: boolean;
  className?: string;
}) {
  const primary = returnTransactionLabel(row);
  const condensed = joinDetailParts([
    formatPeso(parseReturnAmount(row.amount)),
    row.atrStatusCode.name,
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

function buildReturnsHref(
  page: number,
  limit: number,
  sort?: string,
  sortDir?: string,
  tab: "branch" | "approvals" = "branch",
): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (page > 1) params.set("page", String(page));
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));
  if (sort) params.set("sort", sort);
  if (sort && sortDir) params.set("dir", sortDir);
  return `/returns?${params.toString()}`;
}

function formatSaleDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function truncateNotes(value: string | null, max = 48): string {
  const text = value?.trim() ?? "";
  if (!text) return "—";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function SalesReturnsTable({
  result,
  capabilities,
  initialSort = "",
  initialSortDir = "desc",
  listTab = "branch",
}: SalesReturnsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [showAllColumns, setShowAllColumns] = usePersistedBoolean(
    "isms.sales.returns.showAllColumns",
  );
  const [pending, startTransition] = useTransition();
  const [detailsSaleId, setDetailsSaleId] = useState<string | null>(null);
  const [saleDetails, setSaleDetails] = useState<SaleDetailsPayload | null>(null);
  const [headerEditSale, setHeaderEditSale] =
    useState<SaleDetailsPayload | null>(null);
  const [pendingConfirm, setPendingConfirm] =
    useState<SaleReturnPendingConfirm | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [editingLine, setEditingLine] = useState<EditingLine | null>(null);
  const pageSize = parseTablePageSize(result.limit);
  const colCount =
    COMPACT_COL_COUNT + (showAllColumns ? SECONDARY_COL_COUNT : 0);
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as ReturnsSortDir;

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(
      buildReturnsHref(1, limit, sort, sort ? sortDir : undefined, listTab),
    );
  }

  function toggleSort(field: ReturnsSortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(buildReturnsHref(1, pageSize, next.sort, next.dir, listTab));
  }

  const filtered = useMemo(
    () =>
      result.items.filter((row) =>
        matchesTableSearch(query, [
          row.saleId,
          row.transactionNo,
          row.customerName,
          row.branch.name,
          row.amount,
          row.atrStatus,
          row.atrStatusCode.name,
          row.atrStatusCode.code,
          row.returnStatus,
          row.returnStatusCode.name,
          row.returnStatusCode.code,
          row.requestNotes,
        ]),
      ),
    [query, result.items],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        result.items.map((row) => row.transactionNo),
        result.items.map((row) => row.branch.name),
        result.items.map((row) => row.customerName ?? ""),
        result.items.map((row) => row.returnStatusCode.name),
        result.items.map((row) => row.atrStatusCode.name),
      ),
    [result.items],
  );

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

  function handleDetailsReturnAction(action: SaleReturnConfirmAction) {
    if (!saleDetails) return;
    setReturnReason("");
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
    const { action, saleId, returnRequestId } = pendingConfirm;
    const successMessage = SALE_RETURN_CONFIRM_COPY[action].successMessage;

    if (action === "request") {
      const reason = returnReason.trim();
      if (!reason) {
        toast.error("Enter a return reason");
        return;
      }
    }

    startTransition(async () => {
      let res: { error?: string; success?: boolean };

      switch (action) {
        case "request":
          res = await requestReturnAction(saleId, returnReason.trim());
          break;
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
      setReturnReason("");
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

  const copy = pendingConfirm ? SALE_RETURN_CONFIRM_COPY[pendingConfirm.action] : null;

  return (
    <div className="space-y-4">
      <GlobalDataTable
        stickyHeader
        scrollable
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search returns…",
          suggestions,
        }}
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
          itemLabel: "return",
          buildHref: (page) =>
            buildReturnsHref(
              page,
              pageSize,
              sort,
              sort ? sortDir : undefined,
              listTab,
            ),
        }}
        pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
      >
        <TableHeader>
          <TableRow>
            <GlobalTableHead
              sortKey="transactionNo"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as ReturnsSortField)}
            >
              TRN NO.
            </GlobalTableHead>
            <GlobalTableHead
              sortKey="date"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as ReturnsSortField)}
            >
              DATE
            </GlobalTableHead>
            <GlobalTableHead
              sortKey="branch"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as ReturnsSortField)}
            >
              BRANCH
            </GlobalTableHead>
            <GlobalTableHead
              sortKey="customer"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as ReturnsSortField)}
            >
              CUSTOMER
            </GlobalTableHead>
            {showAllColumns ? (
              <GlobalTableHead
                sortKey="amount"
                activeSortKey={sort}
                sortDirection={sortDir}
                onSort={(key) => toggleSort(key as ReturnsSortField)}
              >
                AMOUNT
              </GlobalTableHead>
            ) : null}
            <GlobalTableHead
              sortKey="returnStatus"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as ReturnsSortField)}
            >
              RETURN STATUS
            </GlobalTableHead>
            {showAllColumns ? (
              <>
                <GlobalTableHead
                  sortKey="atrStatus"
                  activeSortKey={sort}
                  sortDirection={sortDir}
                  onSort={(key) => toggleSort(key as ReturnsSortField)}
                >
                  ATR
                </GlobalTableHead>
                <GlobalTableHead>NOTES</GlobalTableHead>
              </>
            ) : null}
            <GlobalTableHead className="w-48">ACTIONS</GlobalTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableEmptyRow
              colSpan={colCount}
              message={
                result.total === 0
                  ? "No return requests yet. Start one from Sales → View details → Request return."
                  : "No results match your search."
              }
            />
          ) : (
            filtered.map((row, index) => {
              const stripe = index % 2 === 1;

              return (
                <TableRow
                  key={row.id}
                  className={cn("group", stripe && "bg-table-stripe")}
                >
                  <TrnDetailCell row={row} showAllColumns={showAllColumns} />
                  <TableCell className="whitespace-nowrap py-2 tabular-nums sm:py-2.5">
                    {formatSaleDate(row.transactionDate)}
                  </TableCell>
                  <TableCell className="py-2 sm:py-2.5">{row.branch.name}</TableCell>
                  <TableCell className="py-2 sm:py-2.5">
                    {row.customerName?.trim() || "—"}
                  </TableCell>
                  {showAllColumns ? (
                    <TableAmountCell
                      value={row.amount}
                      className="py-2 sm:py-2.5"
                    />
                  ) : null}
                  <TableCell className="py-2 sm:py-2.5">
                    <StatusCodeBadge
                      code={row.returnStatusCode.code}
                      name={row.returnStatusCode.name}
                      color={row.returnStatusCode.color}
                    />
                  </TableCell>
                  {showAllColumns ? (
                    <>
                      <TableCell className="py-2 sm:py-2.5">
                        <StatusCodeBadge
                          code={row.atrStatusCode.code}
                          name={row.atrStatusCode.name}
                          color={row.atrStatusCode.color}
                        />
                      </TableCell>
                      <TableCell className="max-w-40 py-2 sm:py-2.5">
                        <span
                          className="block truncate text-sm text-muted-foreground"
                          title={row.requestNotes?.trim() || undefined}
                        >
                          {truncateNotes(row.requestNotes)}
                        </span>
                      </TableCell>
                    </>
                  ) : null}
                  <TableCell className="whitespace-nowrap py-2 sm:py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => openSaleDetails(row.saleId)}
                      >
                        View details
                      </Button>
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
          onReturnAction={handleDetailsReturnAction}
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

      <AlertDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setPendingConfirm(null);
            setReturnReason("");
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
          {pendingConfirm?.action === "request" ? (
            <div className="space-y-2 px-1">
              <Label htmlFor="returns-return-reason">Return reason</Label>
              <Textarea
                id="returns-return-reason"
                value={returnReason}
                onChange={(event) => setReturnReason(event.target.value)}
                placeholder="Why is this sale being returned?"
                rows={3}
                disabled={pending}
                className="resize-y"
              />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                pending ||
                (pendingConfirm?.action === "request" && !returnReason.trim())
              }
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
