"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  approveReturnAction,
  completeReturnRestoreAction,
  evaluateReturnAction,
  rejectReturnAction,
  requestReturnAction,
} from "@/features/sales/actions/sales.actions";
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
import { GlobalDataTable, GlobalTableHead } from "@/lib/data-table";
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
  branch: { name: string };
  serialNumber: { serialNo: string } | null;
  serialNumbers: string[];
  returnRequest: { id: string; status: string } | null;
}

interface SalesTableProps {
  result: {
    items: SaleRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  capabilities: SalesActionCapabilities;
}

function saleTransactionLabel(sale: SaleRow): string {
  return sale.transactionNo || sale.id.slice(-8);
}

function buildSalesHref(page: number, limit: number): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));
  const query = params.toString();
  return query ? `/sales?${query}` : "/sales";
}

export function SalesTable({ result, capabilities }: SalesTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [serialDialogSale, setSerialDialogSale] = useState<SaleRow | null>(null);
  const pageSize = parseTablePageSize(result.limit);

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(buildSalesHref(1, limit));
  }
  const filtered = useMemo(
    () =>
      result.items.filter((sale) =>
        matchesTableSearch(query, [
          sale.id,
          sale.transactionNo,
          sale.branch.name,
          sale.amount,
          sale.serialNumber?.serialNo,
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
        result.items.map((sale) => sale.serialNumber?.serialNo),
        result.items.map((sale) => sale.atrStatus),
      ),
    [result.items],
  );
  const selection = useTableSelection(filtered.map((s) => s.id));

  function runReturnAction(
    action: () => Promise<{ error?: string; success?: boolean }>,
    successMessage: string,
  ) {
    startTransition(async () => {
      const res = await action();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(successMessage);
      router.refresh();
    });
  }

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
          buildHref: (page) => buildSalesHref(page, pageSize),
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
                <GlobalTableHead>Transaction</GlobalTableHead>
                <GlobalTableHead>Branch</GlobalTableHead>
                <GlobalTableHead>Amount</GlobalTableHead>
                <GlobalTableHead>Serial</GlobalTableHead>
                <GlobalTableHead>ATR</GlobalTableHead>
                <GlobalTableHead>Return</GlobalTableHead>
                <GlobalTableHead className="w-48" />
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
                        {s.serialNumber?.serialNo}
                      </button>
                    ) : (
                      (s.serialNumber?.serialNo ?? "—")
                    )}
                  </TableCodeCell>
                  <TableCell>
                    <AtrStatusBadge status={s.atrStatus} />
                  </TableCell>
                  <TableCell>
                    <ReturnStatusBadge status={s.returnRequest?.status} />
                  </TableCell>
                  <TableCell className="space-x-1">
                    {!s.returnRequest && s.atrStatus === "open" && capabilities.canRequestReturn ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          runReturnAction(
                            () => requestReturnAction(s.id),
                            "Return request submitted",
                          )
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
                            runReturnAction(
                              () => evaluateReturnAction(s.returnRequest!.id),
                              "CS evaluation complete",
                            )
                          }
                        >
                          CS evaluate
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            runReturnAction(
                              () => rejectReturnAction(s.returnRequest!.id),
                              "Return rejected",
                            )
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
                            runReturnAction(
                              () => approveReturnAction(s.returnRequest!.id),
                              "TL approved return",
                            )
                          }
                        >
                          TL approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            runReturnAction(
                              () => rejectReturnAction(s.returnRequest!.id),
                              "Return rejected",
                            )
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
                          runReturnAction(
                            () => completeReturnRestoreAction(s.returnRequest!.id),
                            "Inventory restored — ATR closed",
                          )
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
    </div>
  );
}
