"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AddLineItemDialog,
  type DraftSaleLineItem,
} from "@/app/(app)/sales/_components/add-line-item-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createSaleAction } from "@/features/sales/actions/sales.actions";

interface SalesBranchOption {
  id: string;
  name: string;
}

interface LookupOption {
  id: string;
  name: string;
}

interface NewSalesTransactionFormProps {
  branches: SalesBranchOption[];
  autoResolveBranch: boolean;
  paymentTypes: LookupOption[];
  saleTypes: LookupOption[];
  deliveryMethods: LookupOption[];
}

const PROOF_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
const PROOF_MAX_BYTES = 10 * 1024 * 1024;

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function NewSalesTransactionForm({
  branches,
  autoResolveBranch,
  paymentTypes,
  saleTypes,
  deliveryMethods,
}: NewSalesTransactionFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const proofInputRef = useRef<HTMLInputElement>(null);

  const resolvedBranchId = autoResolveBranch ? (branches[0]?.id ?? "") : "";
  const [branchId, setBranchId] = useState(resolvedBranchId);
  const [transactionDate, setTransactionDate] = useState(todayInputValue);
  const [customerName, setCustomerName] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [paymentTypeId, setPaymentTypeId] = useState("");
  const [saleTypeId, setSaleTypeId] = useState("");
  const [deliveryMethodId, setDeliveryMethodId] = useState("");
  const [infoSlipReleased, setInfoSlipReleased] = useState("");
  const [rrReceiveDeliver, setRrReceiveDeliver] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [reserved, setReserved] = useState(false);
  const [lineItems, setLineItems] = useState<DraftSaleLineItem[]>([]);
  const [lineItemOpen, setLineItemOpen] = useState(false);

  const totalSaleAmount = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.saleAmount, 0),
    [lineItems],
  );

  const usedSerialIds = useMemo(
    () => new Set(lineItems.map((item) => item.serialNumberId)),
    [lineItems],
  );

  function removeLineItem(key: string) {
    setLineItems((prev) => prev.filter((item) => item.key !== key));
  }

  function appendLineItems(rows: DraftSaleLineItem[]) {
    setLineItems((prev) => [...prev, ...rows]);
    setLineItemOpen(false);
  }

  function onProofChange(file: File | null) {
    if (!file) {
      setProofFile(null);
      return;
    }
    if (file.size > PROOF_MAX_BYTES) {
      toast.error("Proof must be 10 MB or smaller");
      clearProof();
      return;
    }
    setProofFile(file);
  }

  function clearProof() {
    setProofFile(null);
    if (proofInputRef.current) {
      proofInputRef.current.value = "";
    }
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
    if (lineItems.length === 0) {
      toast.error("Add at least one line item");
      return;
    }

    startTransition(async () => {
      const result = await createSaleAction({
        branchId,
        customerName: customerName.trim(),
        contactNo: contactNo.trim() || undefined,
        transactionDate: transactionDate || undefined,
        paymentTypeId: paymentTypeId || undefined,
        saleTypeId: saleTypeId || undefined,
        customerDeliveryMethodId: deliveryMethodId || undefined,
        infoSlipVsoRrReleased: infoSlipReleased.trim() || undefined,
        rrReceiveDeliver: rrReceiveDeliver.trim() || undefined,
        reserved,
        details: lineItems.map((item) => ({
          packageTypeId: item.packageTypeId ?? undefined,
          promoTypeId: item.promoTypeId ?? undefined,
          modelId: item.modelId ?? undefined,
          serialNumberId: item.serialNumberId,
          saleAmount: item.saleAmount,
          modelPrice: item.modelPrice ?? undefined,
        })),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        reserved ? "Reserved sale recorded" : "Sale transaction saved",
      );
      router.push("/sales");
      router.refresh();
    });
  }

  if (branches.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm">
        No branch in your area of responsibility. Assign an AOR before recording
        sales.
      </div>
    );
  }

  const resolvedBranch = autoResolveBranch ? branches[0] : null;

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">Transaction header</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sale-txn-no">Transaction no.</Label>
            <Input
              id="sale-txn-no"
              value="SAL-… (assigned on save)"
              readOnly
              disabled
              className="bg-muted"
            />
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
            <Label htmlFor="sale-branch">Branch sold *</Label>
            {resolvedBranch ? (
              <Input
                id="sale-branch"
                value={resolvedBranch.name}
                readOnly
                disabled
                className="bg-muted"
              />
            ) : (
              <SearchableSelect
                id="sale-branch"
                options={branches.map((b) => ({ id: b.id, label: b.name }))}
                value={branchId}
                onChange={setBranchId}
                placeholder="Select branch…"
                searchPlaceholder="Search branches…"
              />
            )}
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
          <div className="space-y-2">
            <Label htmlFor="sale-contact">Contact no.</Label>
            <Input
              id="sale-contact"
              type="tel"
              inputMode="tel"
              value={contactNo}
              onChange={(e) => setContactNo(e.target.value)}
              placeholder="09XX XXX XXXX"
            />
          </div>
          <SearchableSelect
            label="Payment type"
            id="sale-payment-type"
            options={paymentTypes.map((p) => ({ id: p.id, label: p.name }))}
            value={paymentTypeId}
            onChange={setPaymentTypeId}
            placeholder="Select payment type…"
            searchPlaceholder="Search payment types…"
            emptyMessage="No active payment types."
            allowClear
            disabled={paymentTypes.length === 0}
          />
          <SearchableSelect
            label="Sale type"
            id="sale-sale-type"
            options={saleTypes.map((s) => ({ id: s.id, label: s.name }))}
            value={saleTypeId}
            onChange={setSaleTypeId}
            placeholder="Select sale type…"
            searchPlaceholder="Search sale types…"
            emptyMessage="No active sale types."
            allowClear
            disabled={saleTypes.length === 0}
          />
          <SearchableSelect
            label="Customer delivery method"
            id="sale-delivery-method"
            options={deliveryMethods.map((d) => ({ id: d.id, label: d.name }))}
            value={deliveryMethodId}
            onChange={setDeliveryMethodId}
            placeholder="Select delivery method…"
            searchPlaceholder="Search delivery methods…"
            emptyMessage="No active delivery methods."
            allowClear
            disabled={deliveryMethods.length === 0}
          />
          <div className="space-y-2">
            <Label htmlFor="sale-info-slip">Info slip / VSO / RR released</Label>
            <Input
              id="sale-info-slip"
              value={infoSlipReleased}
              onChange={(e) => setInfoSlipReleased(e.target.value)}
              placeholder="Reference no."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sale-rr">RR receive / deliver</Label>
            <Input
              id="sale-rr"
              value={rrReceiveDeliver}
              onChange={(e) => setRrReceiveDeliver(e.target.value)}
              placeholder="Reference no."
            />
          </div>
        </div>

        <div className="border-t pt-4">
          <label
            htmlFor="sale-reserved"
            className="flex items-center gap-2 text-sm"
          >
            <Checkbox
              id="sale-reserved"
              checked={reserved}
              onCheckedChange={(v) => setReserved(v === true)}
            />
            Reserved (RSV) — move serials to reserved instead of sold
          </label>
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label htmlFor="sale-proof">Proof (image / PDF)</Label>
          <input
            ref={proofInputRef}
            id="sale-proof"
            type="file"
            accept={PROOF_ACCEPT}
            className="sr-only"
            onChange={(e) => onProofChange(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => proofInputRef.current?.click()}
            >
              <Upload className="size-4" />
              {proofFile ? "Replace file" : "Choose file"}
            </Button>
            {proofFile ? (
              <span className="flex items-center gap-2 rounded-md border bg-muted px-2 py-1 text-sm">
                <span className="max-w-60 truncate">{proofFile.name}</span>
                <span className="text-muted-foreground">
                  {formatFileSize(proofFile.size)}
                </span>
                <button
                  type="button"
                  onClick={clearProof}
                  aria-label="Remove proof file"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                No file selected
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Preview only — file storage is not wired up yet, so the selected file
            is not uploaded on save.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Line items</h2>
          <Button
            type="button"
            variant="outline"
            disabled={!branchId}
            onClick={() => setLineItemOpen(true)}
          >
            <Plus className="size-4" />
            Add Line Item
          </Button>
        </div>

        {lineItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No line items yet. Click Add Line Item to record what was purchased.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-180 text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Package</th>
                  <th className="pb-2 pr-3 font-medium">Brand</th>
                  <th className="pb-2 pr-3 font-medium">Model</th>
                  <th className="pb-2 pr-3 font-medium">SN</th>
                  <th className="pb-2 pr-3 text-right font-medium">Sale</th>
                  <th className="pb-2 pr-3 text-right font-medium">
                    Model price
                  </th>
                  <th className="pb-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => (
                  <tr key={item.key} className="border-b last:border-0">
                    <td className="py-2 pr-3">{item.packageTypeName}</td>
                    <td className="py-2 pr-3">{item.brandName}</td>
                    <td className="py-2 pr-3">{item.modelLabel || "—"}</td>
                    <td className="py-2 pr-3 font-mono">{item.serialNo}</td>
                    <td className="py-2 pr-3 text-right">
                      {formatMoney(item.saleAmount)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {item.modelPrice != null
                        ? formatMoney(item.modelPrice)
                        : "—"}
                    </td>
                    <td className="py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => removeLineItem(item.key)}
                        aria-label={`Remove ${item.serialNo}`}
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

      {lineItemOpen && branchId ? (
        <AddLineItemDialog
          branchId={branchId}
          usedSerialIds={usedSerialIds}
          onAdd={appendLineItems}
          onClose={() => setLineItemOpen(false)}
        />
      ) : null}
    </div>
  );
}
