"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { EditSaleSerialDialog } from "@/app/(app)/sales/_components/edit-sale-serial-dialog";
import {
  SaleDetailsDialog,
  type SaleDetailsLine,
  type SaleDetailsPayload,
  type SaleReturnConfirmAction,
} from "@/app/(app)/sales/_components/sale-details-dialog";
import {
  approveReturnAction,
  completeReturnRestoreAction,
  evaluateReturnAction,
  getSaleDetailsAction,
  rejectReturnAction,
  requestReturnAction,
  type SaleStatusCodeRef,
} from "@/features/sales/actions/sales.actions";
import { TO_FOLLOW_SERIAL_LABEL } from "@/features/sales/constants/to-follow-serial";
import { capturesDeliveryReceipt } from "@/features/sales/utils/delivery-method";
import type { SalesActionCapabilities } from "@/features/sales/constants/sales-permissions";
import {
  TableAmountCell,
  TableCodeCell,
  uniqueSearchSuggestions,
} from "@/components/data-table";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { GlobalDataTable, GlobalTableHead, nextTableSort } from "@/lib/data-table";
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
import { Textarea } from "@/components/ui/textarea";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
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

type PendingConfirm = {
  saleId: string;
  returnRequestId?: string;
  transactionNo: string;
  branchName: string;
  action: SaleReturnConfirmAction;
};

const CONFIRM_COPY: Record<
  SaleReturnConfirmAction,
  { title: string; description: string; confirmLabel: string; successMessage: string }
> = {
  request: {
    title: "Are you sure you want to request a return?",
    description:
      "This starts an ATR return for this sale and sends it for CS evaluation.",
    confirmLabel: "Request return",
    successMessage: "Return request submitted",
  },
  evaluate: {
    title: "Are you sure you want to complete CS evaluation?",
    description:
      "This marks CS evaluation complete and moves the return to Team Lead approval.",
    confirmLabel: "CS evaluate",
    successMessage: "CS evaluation complete",
  },
  approve: {
    title: "Are you sure you want to approve this return?",
    description: "This TL-approves the return so inventory can be restored.",
    confirmLabel: "TL approve",
    successMessage: "TL approved return",
  },
  reject: {
    title: "Are you sure you want to reject this return?",
    description:
      "This rejects the return request and closes the ATR workflow for this sale.",
    confirmLabel: "Reject",
    successMessage: "Return rejected",
  },
  restore: {
    title: "Are you sure you want to restore stock?",
    description:
      "This restores inventory for the returned units and closes the ATR. This cannot be undone from this screen.",
    confirmLabel: "Restore stock",
    successMessage: "Inventory restored — ATR closed",
  },
};

function saleTransactionLabel(sale: SaleRow): string {
  return sale.transactionNo || sale.saleId.slice(-8);
}

/** Null serial means TO-FOLLOW was encoded (placeholder pending a real unit). */
function saleSerialLabel(sale: SaleRow): string {
  return sale.serialNumber?.serialNo ?? TO_FOLLOW_SERIAL_LABEL;
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

export function SalesTable({
  result,
  capabilities,
  initialSort = "",
  initialSortDir = "desc",
}: SalesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [editingLine, setEditingLine] = useState<EditingLine | null>(null);
  const [detailsSaleId, setDetailsSaleId] = useState<string | null>(null);
  const [saleDetails, setSaleDetails] = useState<SaleDetailsPayload | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const pageSize = parseTablePageSize(result.limit);
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

  function handleReturnAction(action: SaleReturnConfirmAction) {
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
    const { action, saleId, returnRequestId, successMessage } = {
      ...pendingConfirm,
      successMessage: CONFIRM_COPY[pendingConfirm.action].successMessage,
    };

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

  const copy = pendingConfirm ? CONFIRM_COPY[pendingConfirm.action] : null;

  return (
    <div className="space-y-4">
      <GlobalDataTable
        stickyHeader
        scrollable
        search={{ value: query, onChange: setQuery, placeholder: "Search sales…", suggestions }}
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
            <GlobalTableHead className="w-12">ID</GlobalTableHead>
            <GlobalTableHead
              sortKey="transactionNo"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as SalesSortField)}
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
            <GlobalTableHead>PACKAGE</GlobalTableHead>
            <GlobalTableHead>BRAND</GlobalTableHead>
            <GlobalTableHead>MODEL</GlobalTableHead>
            <GlobalTableHead>SN</GlobalTableHead>
            <GlobalTableHead
              sortKey="amount"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as SalesSortField)}
            >
              SALE
            </GlobalTableHead>
            <GlobalTableHead>MODEL PRICE</GlobalTableHead>
            <GlobalTableHead>STATUS</GlobalTableHead>
            <GlobalTableHead className="w-36">ACTIONS</GlobalTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="tabular-nums text-muted-foreground">
                {saleIdMap.get(s.saleId) ?? "—"}
              </TableCell>
              <TableCodeCell value={saleTransactionLabel(s)} className="font-semibold" />
              <TableCell className="whitespace-nowrap tabular-nums">
                {formatSaleDate(s.transactionDate)}
              </TableCell>
              <TableCell>{s.branch.name}</TableCell>
              <TableCell>{s.customerName?.trim() || "—"}</TableCell>
              <TableCell>{s.packageName ?? "—"}</TableCell>
              <TableCell>{s.brandName ?? "—"}</TableCell>
              <TableCell className="font-mono text-sm">{s.modelLabel ?? "—"}</TableCell>
              <TableCodeCell value={saleSerialLabel(s)} />
              <TableAmountCell value={s.saleAmount} />
              {s.modelPrice != null ? (
                <TableAmountCell value={s.modelPrice} />
              ) : (
                <TableCell className="text-muted-foreground">—</TableCell>
              )}
              <TableCell>
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
              <TableCell className="whitespace-nowrap">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => openSaleDetails(s.saleId)}
                >
                  View details
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </GlobalDataTable>

      {detailsSaleId && saleDetails ? (
        <SaleDetailsDialog
          sale={saleDetails}
          open
          capabilities={capabilities}
          pending={pending}
          onEditLine={handleEditLine}
          onReturnAction={handleReturnAction}
          onOpenChange={(open) => {
            if (!open) {
              setDetailsSaleId(null);
              setSaleDetails(null);
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
              <Label htmlFor="return-reason">Return reason</Label>
              <Textarea
                id="return-reason"
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
