"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createSaleAction,
  updateAtrStatusAction,
} from "@/features/sales/actions/sales.actions";
import { listBranchesForOrderAction } from "@/features/orders/actions/order.actions";
import {
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
}

export function SalesTable({ sales }: { sales: SaleRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function recordSale(branchId: string, amount: number) {
    startTransition(async () => {
      const result = await createSaleAction({ branchId, amount });
      if (result.error) {
        toast.error("Could not record sale");
        return;
      }
      toast.success("Sale recorded");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <RecordSaleForm onSubmit={recordSale} pending={pending} />
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-sm">{s.id.slice(-8)}</TableCell>
                  <TableCell>{s.branch.name}</TableCell>
                  <TableCell>{s.amount}</TableCell>
                  <TableCell>{s.serialNumber?.serialNo ?? "—"}</TableCell>
                  <TableCell>
                    <select
                      className="rounded-md border px-2 py-1 text-sm"
                      value={s.atrStatus}
                      disabled={pending}
                      onChange={(e) =>
                        startTransition(async () => {
                          await updateAtrStatusAction(
                            s.id,
                            e.target.value as "open" | "reserve" | "closed",
                          );
                          router.refresh();
                        })
                      }
                    >
                      <option value="open">open</option>
                      <option value="reserve">reserve</option>
                      <option value="closed">closed</option>
                    </select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableScroll>
      </DataTableShell>
    </div>
  );
}

function RecordSaleForm({
  onSubmit,
  pending,
}: {
  onSubmit: (branchId: string, amount: number) => void;
  pending: boolean;
}) {
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [branchId, setBranchId] = useState("");
  const [amount, setAmount] = useState("1000");

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4 shadow-sm">
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          const b = await listBranchesForOrderAction();
          setBranches(b);
          if (b[0]) setBranchId(b[0].id);
        }}
      >
        Load branches
      </Button>
      {branches.length > 0 ? (
        <>
          <select
            className="h-9 rounded-md border px-2 text-sm"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-32"
          />
          <Button
            disabled={pending}
            onClick={() => onSubmit(branchId, Number(amount))}
          >
            Record sale
          </Button>
        </>
      ) : null}
    </div>
  );
}
