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
import type { SalesActionCapabilities } from "@/features/sales/constants/sales-permissions";
import { atrOdrfDownloadUrl } from "@/features/sales/constants/process-return";
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
import { TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { usePersistedBoolean } from "@/hooks/use-persisted-boolean";
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
  actionType: "return" | "replacement";
  stockStatusCode: "STK" | "DEF";
  documentTypeName: string | null;
  requestNotes: string | null;
  problemDescriptionText: string | null;
  dealerRsNo: string | null;
  actualDateReturned: string | null;
  hasAtrOdrfPdf: boolean;
  origModelLabel: string | null;
  origSerialNo: string | null;
  origPrice: string;
  replSerialNo: string | null;
  replBranchName: string | null;
  replAmount: string | null;
  replInvoiceNo: string | null;
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
  listTab?: "branch" | "service" | "approvals";
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

/** Compact report columns + ACTIONS */
const COMPACT_COL_COUNT = 10;
/** Extra when "Show all columns" */
const SECONDARY_COL_COUNT = 8;

function buildReturnsHref(
  page: number,
  limit: number,
  sort?: string,
  sortDir?: string,
  tab: "branch" | "service" | "approvals" = "branch",
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

function truncateText(value: string | null, max = 48): string {
  const text = value?.trim() ?? "";
  if (!text) return "—";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function actionTypeLabel(actionType: "return" | "replacement"): string {
  return actionType === "replacement" ? "Replacement" : "Return";
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
  const [processReturnSale, setProcessReturnSale] =
    useState<SaleDetailsPayload | null>(null);
  const [replacementTarget, setReplacementTarget] =
    useState<ReplacementFlowTarget | null>(null);
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
          row.returnStatus,
          row.actionType,
          row.documentTypeName,
          row.problemDescriptionText,
          row.origSerialNo,
          row.replSerialNo,
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
        result.items.map((row) => row.documentTypeName ?? ""),
        result.items.map((row) => row.origSerialNo ?? ""),
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

  function startRowComplete(row: ReturnRow) {
    if (row.returnStatus !== "approved" || !capabilities.canCompleteReturn) {
      return;
    }
    if (row.actionType === "replacement") {
      setReplacementTarget({
        returnRequestId: row.returnRequestId,
        saleId: row.saleId,
        transactionNo: row.transactionNo,
        branchId: row.branch.id,
        branchName: row.branch.name,
      });
      return;
    }
    setPendingConfirm({
      saleId: row.saleId,
      returnRequestId: row.returnRequestId,
      transactionNo: row.transactionNo,
      branchName: row.branch.name,
      action: "restore",
    });
  }

  function confirmPendingAction() {
    if (!pendingConfirm) return;
    const { action, returnRequestId } = pendingConfirm;
    const successMessage = SALE_RETURN_CONFIRM_COPY[action].successMessage;

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
              sortKey="returnStatus"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as ReturnsSortField)}
            >
              STATUS
            </GlobalTableHead>
            <GlobalTableHead>DOC TYPE</GlobalTableHead>
            <GlobalTableHead>TYPE</GlobalTableHead>
            <GlobalTableHead
              sortKey="branch"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as ReturnsSortField)}
            >
              BRANCH SOLD
            </GlobalTableHead>
            <GlobalTableHead>ORIG SN</GlobalTableHead>
            <GlobalTableHead
              sortKey="transactionNo"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as ReturnsSortField)}
            >
              ORIG TRN
            </GlobalTableHead>
            <GlobalTableHead
              sortKey="date"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as ReturnsSortField)}
            >
              ORIG DATE
            </GlobalTableHead>
            {showAllColumns ? (
              <>
                <GlobalTableHead>ORIG PRICE</GlobalTableHead>
                <GlobalTableHead>RS NO</GlobalTableHead>
                <GlobalTableHead>DATE RETURNED</GlobalTableHead>
                <GlobalTableHead>REPL SN</GlobalTableHead>
                <GlobalTableHead>REPL BRANCH</GlobalTableHead>
                <GlobalTableHead>REPL AMOUNT</GlobalTableHead>
                <GlobalTableHead>REPL INVOICE</GlobalTableHead>
              </>
            ) : null}
            <GlobalTableHead>PROBLEM</GlobalTableHead>
            <GlobalTableHead>ATR/ODRF</GlobalTableHead>
            {showAllColumns ? (
              <GlobalTableHead
                sortKey="createdAt"
                activeSortKey={sort}
                sortDirection={sortDir}
                onSort={(key) => toggleSort(key as ReturnsSortField)}
              >
                CREATED
              </GlobalTableHead>
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
              const canCompleteRow =
                row.returnStatus === "approved" &&
                capabilities.canCompleteReturn;

              return (
                <TableRow
                  key={row.id}
                  className={cn("group", stripe && "bg-table-stripe")}
                >
                  <TableCell className="py-2 sm:py-2.5">
                    <StatusCodeBadge
                      code={row.returnStatusCode.code}
                      name={row.returnStatusCode.name}
                      color={row.returnStatusCode.color}
                    />
                  </TableCell>
                  <TableCell className="py-2 sm:py-2.5">
                    {row.documentTypeName?.trim() || "—"}
                  </TableCell>
                  <TableCell className="py-2 sm:py-2.5">
                    {actionTypeLabel(row.actionType)}
                  </TableCell>
                  <TableCell className="py-2 sm:py-2.5">
                    {row.branch.name}
                  </TableCell>
                  <TableCell className="py-2 font-mono text-sm sm:py-2.5">
                    {row.origSerialNo ?? "—"}
                  </TableCell>
                  <TableCell className="py-2 font-mono text-sm font-semibold sm:py-2.5">
                    {row.transactionNo || row.saleId.slice(-8)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2 tabular-nums sm:py-2.5">
                    {formatSaleDate(row.transactionDate)}
                  </TableCell>
                  {showAllColumns ? (
                    <>
                      <TableAmountCell
                        value={row.origPrice}
                        className="py-2 sm:py-2.5"
                      />
                      <TableCell className="py-2 sm:py-2.5">
                        {row.dealerRsNo?.trim() || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2 tabular-nums sm:py-2.5">
                        {formatSaleDate(row.actualDateReturned)}
                      </TableCell>
                      <TableCell className="py-2 font-mono text-sm sm:py-2.5">
                        {row.replSerialNo ?? "—"}
                      </TableCell>
                      <TableCell className="py-2 sm:py-2.5">
                        {row.replBranchName ?? "—"}
                      </TableCell>
                      <TableCell className="py-2 sm:py-2.5">
                        {row.replAmount != null
                          ? formatPeso(Number(row.replAmount))
                          : "—"}
                      </TableCell>
                      <TableCell className="py-2 font-mono text-sm sm:py-2.5">
                        {row.replInvoiceNo ?? "—"}
                      </TableCell>
                    </>
                  ) : null}
                  <TableCell className="max-w-44 py-2 sm:py-2.5">
                    <span
                      className="block truncate text-sm text-muted-foreground"
                      title={
                        row.problemDescriptionText?.trim() ||
                        row.requestNotes?.trim() ||
                        undefined
                      }
                    >
                      {truncateText(
                        row.problemDescriptionText ?? row.requestNotes,
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 sm:py-2.5">
                    {row.hasAtrOdrfPdf ? (
                      <a
                        href={atrOdrfDownloadUrl(row.returnRequestId)}
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Download
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {showAllColumns ? (
                    <TableCell className="whitespace-nowrap py-2 tabular-nums sm:py-2.5">
                      {formatSaleDate(row.createdAt)}
                    </TableCell>
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
                      {canCompleteRow ? (
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          disabled={pending}
                          onClick={() => startRowComplete(row)}
                        >
                          {row.actionType === "replacement"
                            ? "Replacement"
                            : "Return"}
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
