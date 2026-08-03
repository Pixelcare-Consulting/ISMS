"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AddTransactionDetailDialog,
  type DraftSaleDetail,
} from "@/app/(app)/sales/_components/add-transaction-detail-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createSaleAction } from "@/features/sales/actions/sales.actions";
import { isToFollowSerial } from "@/features/sales/constants/to-follow-serial";

interface SalesBranchOption {
  id: string;
  name: string;
}

interface NewSalesTransactionFormProps {
  branches: SalesBranchOption[];
  autoResolveBranch: boolean;
}

function todayInputValue(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function NewSalesTransactionForm({
  branches,
  autoResolveBranch,
}: NewSalesTransactionFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const resolvedBranchId = autoResolveBranch ? (branches[0]?.id ?? "") : "";
  const [branchId, setBranchId] = useState(resolvedBranchId);
  const [customerName, setCustomerName] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayInputValue);
  const [reserved, setReserved] = useState(false);
  const [details, setDetails] = useState<DraftSaleDetail[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);

  const totalSaleAmount = useMemo(
    () => details.reduce((sum, d) => sum + d.saleAmount, 0),
    [details],
  );

  // Exclude TO-FOLLOW so multiple pending lines can reuse the placeholder.
  const usedSerialIds = useMemo(
    () =>
      new Set(
        details
          .map((d) => d.serialNumberId)
          .filter((id) => !isToFollowSerial(id)),
      ),
    [details],
  );

  function removeDetail(key: string) {
    setDetails((prev) => prev.filter((d) => d.key !== key));
  }

  function appendDetails(rows: DraftSaleDetail[]) {
    setDetails((prev) => [...prev, ...rows]);
    setDetailOpen(false);
  }

  function submit() {
    if (!branchId) {
      toast.error("Select a branch");
      return;
    }
    if (!customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (details.length === 0) {
      toast.error("Add at least one transaction detail");
      return;
    }

    startTransition(async () => {
      const result = await createSaleAction({
        branchId,
        customerName: customerName.trim(),
        transactionDate: transactionDate || undefined,
        reserved,
        details: details.map((d) => ({
          packageTypeId: d.packageTypeId ?? undefined,
          modelId: d.modelId ?? undefined,
          serialNumberId: d.serialNumberId,
          saleAmount: d.saleAmount,
          modelPrice: d.modelPrice ?? undefined,
        })),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(reserved ? "Reserved sale recorded" : "Sale transaction saved");
      router.push("/sales");
      router.refresh();
    });
  }

  if (branches.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm">
        No branch in your area of responsibility. Assign an AOR before recording sales.
      </div>
    );
  }

  const resolvedBranch = autoResolveBranch ? branches[0] : null;
  const showBranchPicker = !autoResolveBranch;

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">Transaction header</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sale-txn-no">Transaction number *</Label>
            <Input
              id="sale-txn-no"
              value="SAL-… (assigned on save)"
              readOnly
              disabled
              className="bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sale-branch">Branch sold *</Label>
            {resolvedBranch ? (
              <Input id="sale-branch" value={resolvedBranch.name} readOnly disabled className="bg-muted" />
            ) : showBranchPicker ? (
              <SearchableSelect
                id="sale-branch"
                options={branches.map((b) => ({ id: b.id, label: b.name }))}
                value={branchId}
                onChange={setBranchId}
                placeholder="Select branch…"
                searchPlaceholder="Search branches…"
              />
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sale-date">Transaction date</Label>
            <Input
              id="sale-date"
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sale-customer">Customer name *</Label>
            <Input
              id="sale-customer"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reserved}
                onChange={(e) => setReserved(e.target.checked)}
              />
              Reserved (RSV)
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Transaction details</h2>
          <Button
            type="button"
            variant="outline"
            disabled={!branchId}
            onClick={() => setDetailOpen(true)}
          >
            <Plus className="size-4" />
            Add Detail
          </Button>
        </div>

        {details.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No details yet. Click Add Detail to add line items.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Package type</th>
                  <th className="pb-2 pr-3 font-medium">Model</th>
                  <th className="pb-2 pr-3 font-medium">Serial number</th>
                  <th className="pb-2 pr-3 font-medium text-right">Sale amount</th>
                  <th className="pb-2 pr-3 font-medium text-right">Model price</th>
                  <th className="pb-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {details.map((d) => (
                  <tr key={d.key} className="border-b last:border-0">
                    <td className="py-2 pr-3">{d.packageTypeName}</td>
                    <td className="py-2 pr-3">{d.modelLabel || "—"}</td>
                    <td className="py-2 pr-3 font-mono">{d.serialNo}</td>
                    <td className="py-2 pr-3 text-right">{formatMoney(d.saleAmount)}</td>
                    <td className="py-2 pr-3 text-right">
                      {d.modelPrice != null ? formatMoney(d.modelPrice) : "—"}
                    </td>
                    <td className="py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => removeDetail(d.key)}
                        aria-label={`Remove ${d.serialNo}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end border-t pt-3 text-sm font-medium">
          Total sale amount: {formatMoney(totalSaleAmount)}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || !branchId} onClick={submit}>
          Save Transaction
        </Button>
        <Button asChild variant="outline" disabled={pending}>
          <Link href="/sales">Back</Link>
        </Button>
      </div>

      {detailOpen && branchId ? (
        <AddTransactionDetailDialog
          branchId={branchId}
          usedSerialIds={usedSerialIds}
          onAdd={appendDetails}
          onClose={() => setDetailOpen(false)}
        />
      ) : null}
    </div>
  );
}
