"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { listBranchesForOrderAction } from "@/features/orders/actions/order.actions";
import {
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { TablePagination } from "@/components/data-table/table-pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SaleRow {
  id: string;
  amount: string;
  atrStatus: string;
  branch: { name: string };
  serialNumber: { serialNo: string } | null;
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
}

const RETURN_STATUS_LABELS: Record<string, string> = {
  pending_cs: "Pending CS",
  pending_tl: "Pending TL",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
};

function buildSalesHref(page: number): string {
  return page > 1 ? `/sales?page=${page}` : "/sales";
}

export function SalesTable({ result }: SalesTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
      <RecordSaleForm pending={pending} />
      <DataTableShell>
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>ATR</TableHead>
                <TableHead>Return</TableHead>
                <TableHead className="w-48" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-sm">{s.id.slice(-8)}</TableCell>
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
          </Table>
        </DataTableScroll>
        <TablePagination
          meta={{
            total: result.total,
            page: result.page,
            totalPages: result.totalPages,
            itemLabel: "sale",
          }}
          buildHref={buildSalesHref}
        />
      </DataTableShell>
    </div>
  );
}

function RecordSaleForm({ pending }: { pending: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [branchId, setBranchId] = useState("");
  const [amount, setAmount] = useState("1000");
  const [reserved, setReserved] = useState(false);
  const [serialNumberId, setSerialNumberId] = useState("");
  const [serials, setSerials] = useState<
    { id: string; serialNo: string; skuCode: string; modelName: string }[]
  >([]);

  async function loadSerialsForBranch(id: string) {
    if (!id) {
      setSerials([]);
      setSerialNumberId("");
      return;
    }
    const rows = await listSaleableSerialsAction(id);
    setSerials(rows);
    setSerialNumberId(rows[0]?.id ?? "");
  }

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

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            const b = await listBranchesForOrderAction();
            setBranches(b);
            if (b[0]) {
              setBranchId(b[0].id);
              await loadSerialsForBranch(b[0].id);
            }
          }}
        >
          Load branches
        </Button>
        {branches.length > 0 ? (
          <>
            <select
              className="h-9 rounded-md border px-2 text-sm"
              value={branchId}
              onChange={(e) => {
                const id = e.target.value;
                setBranchId(id);
                void loadSerialsForBranch(id);
              }}
              aria-label="Branch"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <div className="space-y-1">
              <Label htmlFor="sale-serial" className="text-xs text-muted-foreground">
                Serial (STK, AOR-scoped)
              </Label>
              <select
                id="sale-serial"
                className="h-9 rounded-md border px-2 text-sm"
                value={serialNumberId}
                onChange={(e) => setSerialNumberId(e.target.value)}
                disabled={serials.length === 0}
              >
                <option value="">— No serial —</option>
                {serials.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.serialNo} · {s.skuCode}
                  </option>
                ))}
              </select>
            </div>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-32"
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
            <Button disabled={pending || !branchId} onClick={submit}>
              Record sale
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
