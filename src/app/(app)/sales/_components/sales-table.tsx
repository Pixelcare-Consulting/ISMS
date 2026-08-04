"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { EditSaleSerialDialog } from "@/app/(app)/sales/_components/edit-sale-serial-dialog";
import {
  approveReturnAction,
  completeReturnRestoreAction,
  evaluateReturnAction,
  rejectReturnAction,
  requestReturnAction,
} from "@/features/sales/actions/sales.actions";
import { TO_FOLLOW_SERIAL_LABEL } from "@/features/sales/constants/to-follow-serial";
import type { SalesActionCapabilities } from "@/features/sales/constants/sales-permissions";
import {
  TableAmountCell,
  TableCodeCell,
  TableIndexCell,
  TableIndexHead,
  uniqueSearchSuggestions,
} from "@/components/data-table";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { useTableSelection } from "@/components/data-table/use-table-selection";
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
import { Checkbox } from "@/components/ui/checkbox";
import { TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { matchesTableSearch } from "@/utils/match-table-search";

import { SaleSerialsDialog } from "./sale-serials-dialog";
import { AtrStatusBadge, ReturnStatusBadge } from "./sales-status-badges";

interface SaleRow {
  id: string;
  transactionNo: string;
  amount: string;
  atrStatus: string;
  branchId: string;
  branch: { id: string; name: string };
  serialNumberId: string | null;
  serialNumber: { id: string; serialNo: string } | null;
  serialNumbers: string[];
  returnRequest: { id: string; status: string } | null;
}

type SalesSortField = "transactionNo" | "branch" | "amount" | "atrStatus" | "returnStatus";
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

type ReturnConfirmAction =
  | "request"
  | "evaluate"
  | "approve"
  | "reject"
  | "restore";

type PendingConfirm = {
  saleId: string;
  returnRequestId?: string;
  transactionNo: string;
  branchName: string;
  action: ReturnConfirmAction;
};

const CONFIRM_COPY: Record<
  ReturnConfirmAction,
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
  return sale.transactionNo || sale.id.slice(-8);
}

/** Null serial means TO-FOLLOW was encoded (placeholder pending a real unit). */
function saleSerialLabel(sale: SaleRow): string {
  return sale.serialNumber?.serialNo ?? TO_FOLLOW_SERIAL_LABEL;
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
  const [editingSale, setEditingSale] = useState<SaleRow | null>(null);
  const [serialDialogSale, setSerialDialogSale] = useState<SaleRow | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
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
          sale.id,
          sale.transactionNo,
          sale.branch.name,
          sale.amount,
          saleSerialLabel(sale),
          ...sale.serialNumbers,
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
        result.items.map((sale) => saleSerialLabel(sale)),
        result.items.map((sale) => sale.atrStatus),
      ),
    [result.items],
  );
  const selection = useTableSelection(filtered.map((s) => s.id));

  function confirmPendingAction() {
    if (!pendingConfirm) return;
    const { action, saleId, returnRequestId, successMessage } = {
      ...pendingConfirm,
      successMessage: CONFIRM_COPY[pendingConfirm.action].successMessage,
    };

    startTransition(async () => {
      let res: { error?: string; success?: boolean };

      switch (action) {
        case "request":
          res = await requestReturnAction(saleId);
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
      router.refresh();
    });
  }

  const copy = pendingConfirm ? CONFIRM_COPY[pendingConfirm.action] : null;

  return (
    <div className="space-y-4">
      <GlobalDataTable
        stickyHeader
        scrollable
        search={{ value: query, onChange: setQuery, placeholder: "Search sales…", suggestions }}
        toolbarActions={
          selection.selectedCount > 0 ? (
            <Button variant="secondary" onClick={selection.clearSelection}>
              {selection.selectedCount} selected
            </Button>
          ) : null
        }
        pagination={{
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          itemLabel: "sale",
          buildHref: (page) => buildSalesHref(page, pageSize, sort, sort ? sortDir : undefined),
        }}
        pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
      >
        <TableHeader>
          <TableRow>
            <GlobalTableHead className="w-10">
              <Checkbox
                checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                aria-label="Select all sales rows"
              />
            </GlobalTableHead>
            <TableIndexHead />
            <GlobalTableHead
              sortKey="transactionNo"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as SalesSortField)}
            >
              Transaction
            </GlobalTableHead>
            <GlobalTableHead
              sortKey="branch"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as SalesSortField)}
            >
              Branch
            </GlobalTableHead>
            <GlobalTableHead
              sortKey="amount"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as SalesSortField)}
            >
              Amount
            </GlobalTableHead>
            <GlobalTableHead>Serial</GlobalTableHead>
            <GlobalTableHead
              sortKey="atrStatus"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as SalesSortField)}
            >
              ATR
            </GlobalTableHead>
            <GlobalTableHead
              sortKey="returnStatus"
              activeSortKey={sort}
              sortDirection={sortDir}
              onSort={(key) => toggleSort(key as SalesSortField)}
            >
              Return
            </GlobalTableHead>
            <GlobalTableHead className="w-64" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((s, index) => (
            <TableRow key={s.id} data-state={selection.isRowSelected(s.id) ? "selected" : undefined}>
              <TableCell>
                <Checkbox
                  checked={selection.isRowSelected(s.id)}
                  onCheckedChange={(checked) => selection.toggleRow(s.id, checked === true)}
                  aria-label={`Select sale ${saleTransactionLabel(s)}`}
                />
              </TableCell>
              <TableIndexCell
                index={(result.page - 1) * result.limit + index + 1}
              />
              <TableCodeCell value={saleTransactionLabel(s)} />
              <TableCell>{s.branch.name}</TableCell>
              <TableAmountCell value={s.amount} />
              <TableCodeCell>
                {s.serialNumbers.length > 1 ? (
                  <button
                    type="button"
                    className="cursor-pointer text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setSerialDialogSale(s)}
                    aria-label={`View ${s.serialNumbers.length} serial numbers for ${saleTransactionLabel(s)}`}
                  >
                    {saleSerialLabel(s)}
                  </button>
                ) : (
                  saleSerialLabel(s)
                )}
              </TableCodeCell>
              <TableCell>
                <AtrStatusBadge status={s.atrStatus} />
              </TableCell>
              <TableCell>
                <ReturnStatusBadge status={s.returnRequest?.status} />
              </TableCell>
              <TableCell className="space-x-1 whitespace-nowrap">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setEditingSale(s)}
                >
                  Edit
                </Button>
                {!s.returnRequest && s.atrStatus === "open" && capabilities.canRequestReturn ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      setPendingConfirm({
                        saleId: s.id,
                        transactionNo: saleTransactionLabel(s),
                        branchName: s.branch.name,
                        action: "request",
                      })
                    }
                  >
                    Request return
                  </Button>
                ) : null}
                {s.returnRequest?.status === "pending_cs" && capabilities.canEvaluateReturn ? (
                  <>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        setPendingConfirm({
                          saleId: s.id,
                          returnRequestId: s.returnRequest!.id,
                          transactionNo: saleTransactionLabel(s),
                          branchName: s.branch.name,
                          action: "evaluate",
                        })
                      }
                    >
                      CS evaluate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        setPendingConfirm({
                          saleId: s.id,
                          returnRequestId: s.returnRequest!.id,
                          transactionNo: saleTransactionLabel(s),
                          branchName: s.branch.name,
                          action: "reject",
                        })
                      }
                    >
                      Reject
                    </Button>
                  </>
                ) : null}
                {s.returnRequest?.status === "pending_tl" && capabilities.canApproveReturn ? (
                  <>
                    <Button
                      size="sm"
                      className="bg-amber-600 text-white hover:bg-amber-700"
                      disabled={pending}
                      onClick={() =>
                        setPendingConfirm({
                          saleId: s.id,
                          returnRequestId: s.returnRequest!.id,
                          transactionNo: saleTransactionLabel(s),
                          branchName: s.branch.name,
                          action: "approve",
                        })
                      }
                    >
                      TL approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        setPendingConfirm({
                          saleId: s.id,
                          returnRequestId: s.returnRequest!.id,
                          transactionNo: saleTransactionLabel(s),
                          branchName: s.branch.name,
                          action: "reject",
                        })
                      }
                    >
                      Reject
                    </Button>
                  </>
                ) : null}
                {s.returnRequest?.status === "approved" && capabilities.canCompleteReturn ? (
                  <Button
                    size="sm"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    disabled={pending}
                    onClick={() =>
                      setPendingConfirm({
                        saleId: s.id,
                        returnRequestId: s.returnRequest!.id,
                        transactionNo: saleTransactionLabel(s),
                        branchName: s.branch.name,
                        action: "restore",
                      })
                    }
                  >
                    Restore stock
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </GlobalDataTable>

      {editingSale ? (
        <EditSaleSerialDialog
          saleId={editingSale.id}
          transactionNo={saleTransactionLabel(editingSale)}
          branchId={editingSale.branchId}
          currentSerialId={editingSale.serialNumberId}
          currentSerialLabel={saleSerialLabel(editingSale)}
          onClose={() => {
            setEditingSale(null);
            router.refresh();
          }}
        />
      ) : null}

      <SaleSerialsDialog
        open={serialDialogSale != null}
        onOpenChange={(open) => {
          if (!open) setSerialDialogSale(null);
        }}
        transactionNo={
          serialDialogSale ? saleTransactionLabel(serialDialogSale) : ""
        }
        serialNumbers={serialDialogSale?.serialNumbers ?? []}
      />

      <AlertDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent>
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
