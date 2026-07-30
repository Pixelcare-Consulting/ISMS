"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  approveReturnAction,
  completeReturnRestoreAction,
  createSaleAction,
  evaluateReturnAction,
  listSaleableSerialsAction,
  rejectReturnAction,
  requestReturnAction,
} from "@/features/sales/actions/sales.actions";
import { TableIndexCell, TableIndexHead, uniqueSearchSuggestions } from "@/components/data-table";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { GlobalDataTable, GlobalTableHead } from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { matchesTableSearch } from "@/utils/match-table-search";

interface SaleRow {
  id: string;
  transactionNo: string;
  amount: string;
  atrStatus: string;
  branch: { name: string };
  serialNumber: { serialNo: string } | null;
  returnRequest: { id: string; status: string } | null;
}

interface SalesBranchOption {
  id: string;
  name: string;
}

interface SalesTableProps {
  result: {
    items: SaleRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  roleSlugs: string[];
  branches: SalesBranchOption[];
  /** PS with a single AOR branch — hide branch picker and auto-scope serials. */
  autoResolveBranch: boolean;
}

const RETURN_STATUS_LABELS: Record<string, string> = {
  pending_cs: "Pending CS",
  pending_tl: "Pending TL",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
};

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

export function SalesTable({
  result,
  roleSlugs,
  branches,
  autoResolveBranch,
}: SalesTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const pageSize = parseTablePageSize(result.limit);
  // Role context from page (PS auto-branch vs TL / multi-branch picker).
  const isPsEncode = roleSlugs.includes("ps") && autoResolveBranch;
  const isMultiBranchEncode = !isPsEncode;

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
      <RecordSaleForm
        pending={pending}
        branches={branches}
        autoResolveBranch={autoResolveBranch}
        showBranchPicker={isMultiBranchEncode}
      />
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
                  <TableCell className="font-mono text-sm">{saleTransactionLabel(s)}</TableCell>
                  <TableCell>{s.branch.name}</TableCell>
                  <TableCell>{s.amount}</TableCell>
                  <TableCell>{s.serialNumber?.serialNo ?? "—"}</TableCell>
                  <TableCell>{s.atrStatus}</TableCell>
                  <TableCell>
                    {s.returnRequest
                      ? RETURN_STATUS_LABELS[s.returnRequest.status] ?? s.returnRequest.status
                      : "—"}
                  </TableCell>
                  <TableCell className="space-x-1">
                    {!s.returnRequest && s.atrStatus === "open" ? (
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
                    {s.returnRequest?.status === "pending_cs" ? (
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
                    {s.returnRequest?.status === "pending_tl" ? (
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
                    {s.returnRequest?.status === "approved" ? (
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
    </div>
  );
}

function RecordSaleForm({
  pending,
  branches,
  autoResolveBranch,
  showBranchPicker,
}: {
  pending: boolean;
  branches: SalesBranchOption[];
  autoResolveBranch: boolean;
  showBranchPicker: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const resolvedBranchId = autoResolveBranch ? (branches[0]?.id ?? "") : "";
  const [branchId, setBranchId] = useState(resolvedBranchId);
  const [amount, setAmount] = useState("1000");
  const [reserved, setReserved] = useState(false);
  const [serialNumberId, setSerialNumberId] = useState("");
  const [serials, setSerials] = useState<
    { id: string; serialNo: string; skuCode: string; modelName: string }[]
  >([]);
  const [serialsLoading, setSerialsLoading] = useState(false);

  async function loadSerialsForBranch(id: string) {
    if (!id) {
      setSerials([]);
      setSerialNumberId("");
      return;
    }
    setSerialsLoading(true);
    try {
      const rows = await listSaleableSerialsAction(id);
      setSerials(rows);
      setSerialNumberId(rows[0]?.id ?? "");
    } finally {
      setSerialsLoading(false);
    }
  }

  useEffect(() => {
    if (!autoResolveBranch || !resolvedBranchId) return;
    let cancelled = false;
    setSerialsLoading(true);
    void listSaleableSerialsAction(resolvedBranchId)
      .then((rows) => {
        if (cancelled) return;
        setSerials(rows);
        setSerialNumberId(rows[0]?.id ?? "");
      })
      .catch(() => {
        if (cancelled) return;
        setSerials([]);
        setSerialNumberId("");
      })
      .finally(() => {
        if (!cancelled) setSerialsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [autoResolveBranch, resolvedBranchId]);

  function submit() {
    startTransition(async () => {
      const result = await createSaleAction({
        branchId,
        amount: Number(amount),
        serialNumberId: serialNumberId || undefined,
        reserved,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(reserved ? "Reserved sale recorded" : "Sale recorded");
      router.refresh();
    });
  }

  const resolvedBranch = autoResolveBranch ? branches[0] : null;

  if (branches.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm">
        No branch in your area of responsibility. Assign an AOR before recording sales.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-2">
        {resolvedBranch ? (
          <p className="w-full text-sm text-muted-foreground sm:w-auto sm:pb-2">
            Branch: <span className="font-medium text-foreground">{resolvedBranch.name}</span>
          </p>
        ) : null}
        {showBranchPicker ? (
          <SearchableSelect
            className="w-full sm:w-[200px]"
            options={branches.map((b) => ({ id: b.id, label: b.name }))}
            value={branchId}
            onChange={(id) => {
              setBranchId(id);
              void loadSerialsForBranch(id);
            }}
            placeholder="Select branch…"
            searchPlaceholder="Search branches…"
          />
        ) : null}
        <SearchableSelect
          label="Serial (STK, AOR-scoped)"
          id="sale-serial"
          className="w-full sm:w-[240px]"
          options={serials.map((s) => ({
            id: s.id,
            label: `${s.serialNo} · ${s.skuCode}`,
          }))}
          value={serialNumberId}
          onChange={setSerialNumberId}
          allowClear
          placeholder={serialsLoading ? "Loading serials…" : "— No serial —"}
          searchPlaceholder="Search serials…"
          emptyMessage="No serials for this branch."
          disabled={!branchId || serialsLoading || serials.length === 0}
        />
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full sm:w-32"
          aria-label="Amount"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reserved}
            onChange={(e) => setReserved(e.target.checked)}
          />
          Reserved (RSV)
        </label>
        <Button className="w-full sm:w-auto" disabled={pending || !branchId} onClick={submit}>
          Record sale
        </Button>
      </div>
    </div>
  );
}
