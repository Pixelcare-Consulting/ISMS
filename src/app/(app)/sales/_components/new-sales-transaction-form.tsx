"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AddTransactionDetailDialog,
  type DraftSaleDetail,
} from "@/app/(app)/sales/_components/add-transaction-detail-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  createSaleAction,
  listStockSourceBranchesForSalesAction,
  uploadSaleProofAction,
} from "@/features/sales/actions/sales.actions";
import { isToFollowSerial } from "@/features/sales/constants/to-follow-serial";
import { SALE_PROOF_MAX_FILES } from "@/features/sales/utils/sale-proof";
import { formatPeso } from "@/utils/format-currency";

interface SalesBranchOption {
  id: string;
  name: string;
}

interface LookupOption {
  id: string;
  name: string;
}

type ProofAttachment = {
  path: string;
  name: string;
};

interface NewSalesTransactionFormProps {
  branches: SalesBranchOption[];
  autoResolveBranch: boolean;
  paymentTypes: LookupOption[];
  saleTypes: LookupOption[];
  deliveryMethods: LookupOption[];
  promoTypes: LookupOption[];
  brands: LookupOption[];
}

function todayInputValue(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function NewSalesTransactionForm({
  branches,
  autoResolveBranch,
  paymentTypes,
  saleTypes,
  deliveryMethods,
  promoTypes,
  brands,
}: NewSalesTransactionFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const resolvedBranchId = autoResolveBranch ? (branches[0]?.id ?? "") : "";
  const [branchId, setBranchId] = useState(resolvedBranchId);
  const [alternateBranchId, setAlternateBranchId] = useState(resolvedBranchId);
  const [stockSources, setStockSources] = useState<SalesBranchOption[]>(
    resolvedBranchId && branches[0]
      ? [{ id: branches[0].id, name: branches[0].name }]
      : [],
  );
  const [transactionNo, setTransactionNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [siTrans, setSiTrans] = useState("");
  const [infoSlipVsoRrReleased, setInfoSlipVsoRrReleased] = useState("");
  const [rrReceiveDeliver, setRrReceiveDeliver] = useState("");
  const [paymentTypeId, setPaymentTypeId] = useState("");
  const [saleTypeId, setSaleTypeId] = useState("");
  const [customerDeliveryMethodId, setCustomerDeliveryMethodId] = useState("");
  const [proofs, setProofs] = useState<ProofAttachment[]>([]);
  const [proofUploading, setProofUploading] = useState(false);
  const [transactionDate, setTransactionDate] = useState(todayInputValue);
  const [reserved, setReserved] = useState(false);
  const [details, setDetails] = useState<DraftSaleDetail[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    if (!branchId) return;

    let cancelled = false;
    void (async () => {
      try {
        const rows = await listStockSourceBranchesForSalesAction(branchId);
        if (cancelled) return;
        setStockSources(rows);
        setAlternateBranchId((prev) =>
          rows.some((r) => r.id === prev) ? prev : (rows[0]?.id ?? branchId),
        );
      } catch {
        if (cancelled) return;
        toast.error("Failed to load stock source branches");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branchId]);

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

  function onBranchChange(id: string) {
    setBranchId(id);
    setDetails([]);
    setStockSources([]);
    setAlternateBranchId("");
  }

  async function onProofsSelected(fileList: FileList | null) {
    if (!fileList?.length) return;

    const remaining = SALE_PROOF_MAX_FILES - proofs.length;
    if (remaining <= 0) {
      toast.error(`You can attach up to ${SALE_PROOF_MAX_FILES} proof files`);
      return;
    }

    const selected = Array.from(fileList).slice(0, remaining);
    if (fileList.length > remaining) {
      toast.message(
        `Only ${remaining} more file${remaining === 1 ? "" : "s"} can be added`,
      );
    }

    setProofUploading(true);
    try {
      const formData = new FormData();
      for (const file of selected) {
        formData.append("proof", file);
      }
      const result = await uploadSaleProofAction(formData);
      if (result.error || !("paths" in result) || !result.paths?.length) {
        toast.error(result.error ?? "Failed to upload proof");
        return;
      }
      const uploaded = result.paths.map((path, index) => ({
        path,
        name: selected[index]?.name ?? path.split("/").pop() ?? "proof",
      }));
      setProofs((prev) => [...prev, ...uploaded]);
      toast.success(
        uploaded.length === 1
          ? "Proof uploaded"
          : `${uploaded.length} proof files uploaded`,
      );
    } finally {
      setProofUploading(false);
    }
  }

  function removeProof(path: string) {
    setProofs((prev) => prev.filter((p) => p.path !== path));
  }

  function submit() {
    if (!transactionNo.trim()) {
      toast.error("Transaction number is required");
      return;
    }
    if (!branchId) {
      toast.error("Select a branch");
      return;
    }
    if (!alternateBranchId) {
      toast.error("Select a stock source branch");
      return;
    }
    if (!customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (!siTrans.trim()) {
      toast.error("SI/Trans no is required");
      return;
    }
    if (!paymentTypeId) {
      toast.error("Payment type is required");
      return;
    }
    if (!saleTypeId) {
      toast.error("Sale type is required");
      return;
    }
    if (!customerDeliveryMethodId) {
      toast.error("Customer delivery method is required");
      return;
    }
    if (details.length === 0) {
      toast.error("Add at least one transaction detail");
      return;
    }

    startTransition(async () => {
      const result = await createSaleAction({
        transactionNo: transactionNo.trim(),
        branchId,
        alternateBranchId,
        customerName: customerName.trim(),
        contactNo: contactNo.trim() || undefined,
        siTrans: siTrans.trim(),
        paymentTypeId,
        saleTypeId,
        customerDeliveryMethodId,
        infoSlipVsoRrReleased: infoSlipVsoRrReleased.trim() || undefined,
        rrReceiveDeliver: rrReceiveDeliver.trim() || undefined,
        proof: proofs.length > 0 ? proofs.map((p) => p.path) : undefined,
        transactionDate: transactionDate || undefined,
        reserved,
        details: details.map((d) => ({
          packageTypeId: d.packageTypeId,
          brandId: d.brandId,
          promoTypeId: d.promoTypeId ?? undefined,
          modelId: d.modelId,
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
              value={transactionNo}
              onChange={(e) => setTransactionNo(e.target.value)}
              placeholder="Enter transaction number"
              className="font-mono"
              autoComplete="off"
              maxLength={100}
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
                onChange={onBranchChange}
                placeholder="Select branch…"
                searchPlaceholder="Search branches…"
              />
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sale-stock-source">Branch or alternate branch *</Label>
            <SearchableSelect
              id="sale-stock-source"
              options={stockSources.map((b) => ({ id: b.id, label: b.name }))}
              value={alternateBranchId}
              onChange={(id) => {
                setAlternateBranchId(id);
                setDetails([]);
              }}
              placeholder={branchId ? "Select branch with stock…" : "Select branch sold first…"}
              searchPlaceholder="Search branches with stock…"
              emptyMessage="No sellable stock in your area."
              disabled={!branchId || stockSources.length === 0}
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
          <div className="space-y-2">
            <Label htmlFor="sale-si-trans">SI/Trans no *</Label>
            <Input
              id="sale-si-trans"
              value={siTrans}
              onChange={(e) => setSiTrans(e.target.value)}
              placeholder="SI / Trans number"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sale-info-slip">Info slip / VSO / RR released</Label>
            <Input
              id="sale-info-slip"
              value={infoSlipVsoRrReleased}
              onChange={(e) => setInfoSlipVsoRrReleased(e.target.value)}
              placeholder="Input Info slip / VSO / RR released"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sale-rr-receive">RR receive / deliver</Label>
            <Input
              id="sale-rr-receive"
              value={rrReceiveDeliver}
              onChange={(e) => setRrReceiveDeliver(e.target.value)}
              placeholder="Input RR receive / deliver"
            />
          </div>
          <div className="space-y-2">
            <Label>Payment type *</Label>
            <SearchableSelect
              options={paymentTypes.map((p) => ({ id: p.id, label: p.name }))}
              value={paymentTypeId}
              onChange={setPaymentTypeId}
              placeholder="Select payment type…"
              searchPlaceholder="Search payment types…"
              emptyMessage="No payment types."
            />
          </div>
          <div className="space-y-2">
            <Label>Sale type *</Label>
            <SearchableSelect
              options={saleTypes.map((p) => ({ id: p.id, label: p.name }))}
              value={saleTypeId}
              onChange={setSaleTypeId}
              placeholder="Select sale type…"
              searchPlaceholder="Search sale types…"
              emptyMessage="No sale types."
            />
          </div>
          <div className="space-y-2">
            <Label>Customer delivery method *</Label>
            <SearchableSelect
              options={deliveryMethods.map((p) => ({ id: p.id, label: p.name }))}
              value={customerDeliveryMethodId}
              onChange={setCustomerDeliveryMethodId}
              placeholder="Select delivery method…"
              searchPlaceholder="Search delivery methods…"
              emptyMessage="No delivery methods."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sale-proof">Proof</Label>
            <Input
              id="sale-proof"
              type="file"
              accept="image/*,.pdf"
              multiple
              disabled={proofUploading || proofs.length >= SALE_PROOF_MAX_FILES}
              onChange={(e) => {
                const files = e.target.files;
                void onProofsSelected(files);
                e.target.value = "";
              }}
            />
            <p className="text-xs text-muted-foreground">
              You can attach up to {SALE_PROOF_MAX_FILES} images or PDFs
              {proofs.length > 0 ? ` · ${proofs.length} attached` : ""}.
            </p>
            {proofs.length > 0 ? (
              <ul className="space-y-1.5">
                {proofs.map((proof) => (
                  <li
                    key={proof.path}
                    className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs"
                  >
                    <span className="min-w-0 truncate" title={proof.name}>
                      {proof.name}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={proofUploading || pending}
                      onClick={() => removeProof(proof.path)}
                      aria-label={`Remove ${proof.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reserved}
            onChange={(e) => setReserved(e.target.checked)}
          />
          Reserved (RSV)
        </label>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Transaction details</h2>
          <Button
            type="button"
            variant="outline"
            disabled={!branchId || !alternateBranchId}
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
            <table className="w-full min-w-200 text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Package</th>
                  <th className="pb-2 pr-3 font-medium">Brand</th>
                  <th className="pb-2 pr-3 font-medium">Promo</th>
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
                    <td className="py-2 pr-3">{d.brandName}</td>
                    <td className="py-2 pr-3">{d.promoTypeName ?? "—"}</td>
                    <td className="py-2 pr-3">{d.modelLabel || "—"}</td>
                    <td className="py-2 pr-3 font-mono text-sm">{d.serialNo}</td>
                    <td className="py-2 pr-3 text-right font-mono text-sm tabular-nums">
                      {formatPeso(d.saleAmount)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-sm tabular-nums">
                      {formatPeso(d.modelPrice)}
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

        <div className="flex justify-end border-t pt-3 text-sm font-medium font-mono tabular-nums">
          Total sale amount: {formatPeso(totalSaleAmount)}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || !branchId || !alternateBranchId} onClick={submit}>
          Save Transaction
        </Button>
        <Button asChild variant="outline" disabled={pending}>
          <Link href="/sales">Back</Link>
        </Button>
      </div>

      {detailOpen && branchId && alternateBranchId ? (
        <AddTransactionDetailDialog
          stockBranchId={alternateBranchId}
          brands={brands}
          promoTypes={promoTypes}
          usedSerialIds={usedSerialIds}
          transactionDate={transactionDate || undefined}
          onAdd={appendDetails}
          onClose={() => setDetailOpen(false)}
        />
      ) : null}
    </div>
  );
}
