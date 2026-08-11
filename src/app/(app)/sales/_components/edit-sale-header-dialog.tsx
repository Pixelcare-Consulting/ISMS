"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import type { SaleDetailsPayload } from "@/app/(app)/sales/_components/sale-details-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  listBranchesForSalesAction,
  listCustomerDeliveryMethodsForSalesAction,
  listPaymentTypesForSalesAction,
  listSaleTypesForSalesAction,
  listStockSourceBranchesForSalesAction,
  updateSaleHeaderAction,
  uploadSaleProofAction,
} from "@/features/sales/actions/sales.actions";
import { SALE_PROOF_MAX_FILES } from "@/features/sales/utils/sale-proof";

type LookupOption = { id: string; name: string };
type ProofAttachment = { path: string; name: string };

function todayInputValue(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function EditSaleHeaderDialog({
  sale,
  open,
  onOpenChange,
  onSaved,
}: {
  sale: SaleDetailsPayload;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<LookupOption[]>([]);
  const [stockSources, setStockSources] = useState<LookupOption[]>([]);
  const [paymentTypes, setPaymentTypes] = useState<LookupOption[]>([]);
  const [saleTypes, setSaleTypes] = useState<LookupOption[]>([]);
  const [deliveryMethods, setDeliveryMethods] = useState<LookupOption[]>([]);

  const hasRealSerials = sale.lines.some((line) => line.serialNumberId);
  const [transactionNo, setTransactionNo] = useState(sale.transactionNo);
  const [branchId, setBranchId] = useState(sale.branchId);
  const [alternateBranchId, setAlternateBranchId] = useState(
    sale.alternateBranchId,
  );
  const [transactionDate, setTransactionDate] = useState(
    sale.transactionDateInput ?? todayInputValue(),
  );
  const [customerName, setCustomerName] = useState(sale.customerName ?? "");
  const [contactNo, setContactNo] = useState(sale.contactNo ?? "");
  const [infoSlipVsoRrReleased, setInfoSlipVsoRrReleased] = useState(
    sale.infoSlipVsoRrReleased ?? "",
  );
  const [rrReceiveDeliver, setRrReceiveDeliver] = useState(
    sale.rrReceiveDeliver ?? "",
  );
  const [paymentTypeId, setPaymentTypeId] = useState(sale.paymentTypeId ?? "");
  const [saleTypeId, setSaleTypeId] = useState(sale.saleTypeId ?? "");
  const [customerDeliveryMethodId, setCustomerDeliveryMethodId] = useState(
    sale.customerDeliveryMethodId ?? "",
  );
  const [proofs, setProofs] = useState<ProofAttachment[]>(
    sale.proofPaths.map((path) => ({
      path,
      name: path.split("/").pop() ?? path,
    })),
  );
  const [proofUploading, setProofUploading] = useState(false);
  const [reserved, setReserved] = useState(sale.reserved);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const [branchRows, paymentRows, saleTypeRows, deliveryRows] =
          await Promise.all([
            listBranchesForSalesAction(),
            listPaymentTypesForSalesAction(),
            listSaleTypesForSalesAction(),
            listCustomerDeliveryMethodsForSalesAction(),
          ]);
        if (cancelled) return;
        setBranches(branchRows);
        setPaymentTypes(paymentRows);
        setSaleTypes(saleTypeRows);
        setDeliveryMethods(deliveryRows);
      } catch {
        if (!cancelled) toast.error("Failed to load header lookups");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !branchId) return;
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
        if (!cancelled) toast.error("Failed to load stock source branches");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, branchId]);

  async function onProofsSelected(fileList: FileList | null) {
    if (!fileList?.length) return;
    const remaining = SALE_PROOF_MAX_FILES - proofs.length;
    if (remaining <= 0) {
      toast.error(`You can attach up to ${SALE_PROOF_MAX_FILES} proof files`);
      return;
    }
    const selected = Array.from(fileList).slice(0, remaining);
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

    startTransition(async () => {
      const result = await updateSaleHeaderAction({
        saleId: sale.id,
        transactionNo: transactionNo.trim(),
        branchId,
        alternateBranchId,
        customerName: customerName.trim(),
        contactNo: contactNo.trim() || undefined,
        siTrans: transactionNo.trim(),
        paymentTypeId,
        saleTypeId,
        customerDeliveryMethodId,
        infoSlipVsoRrReleased: infoSlipVsoRrReleased.trim() || undefined,
        rrReceiveDeliver: rrReceiveDeliver.trim() || undefined,
        proof: proofs.map((p) => p.path),
        transactionDate: transactionDate || undefined,
        reserved,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Sale header updated");
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] w-[min(calc(100vw-2rem),40rem)] max-w-2xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0 pr-8 text-left">
          <DialogTitle>Edit transaction header</DialogTitle>
          <DialogDescription>
            Update header fields for {sale.transactionNo}. Sale lines stay
            unchanged.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-sale-txn-no">Transaction number *</Label>
                <Input
                  id="edit-sale-txn-no"
                  value={transactionNo}
                  onChange={(e) => setTransactionNo(e.target.value)}
                  className="font-mono"
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label>Branch sold *</Label>
                <SearchableSelect
                  options={branches.map((b) => ({ id: b.id, label: b.name }))}
                  value={branchId}
                  onChange={(id) => {
                    setBranchId(id);
                    setStockSources([]);
                    setAlternateBranchId("");
                  }}
                  placeholder="Select branch…"
                  searchPlaceholder="Search branches…"
                  disabled={hasRealSerials || pending}
                />
                {hasRealSerials ? (
                  <p className="text-xs text-muted-foreground">
                    Branch is locked because this sale already has real serials.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Branch or alternate branch *</Label>
                <SearchableSelect
                  options={stockSources.map((b) => ({
                    id: b.id,
                    label: b.name,
                  }))}
                  value={alternateBranchId}
                  onChange={setAlternateBranchId}
                  placeholder="Select stock source…"
                  searchPlaceholder="Search stock sources…"
                  disabled={hasRealSerials || pending || !branchId}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sale-date">Transaction date</Label>
                <Input
                  id="edit-sale-date"
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sale-customer">Customer name *</Label>
                <Input
                  id="edit-sale-customer"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sale-contact">Contact no.</Label>
                <Input
                  id="edit-sale-contact"
                  type="tel"
                  value={contactNo}
                  onChange={(e) => setContactNo(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sale-info-slip">
                  Info slip / VSO / RR released
                </Label>
                <Input
                  id="edit-sale-info-slip"
                  value={infoSlipVsoRrReleased}
                  onChange={(e) => setInfoSlipVsoRrReleased(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sale-rr">RR receive / deliver</Label>
                <Input
                  id="edit-sale-rr"
                  value={rrReceiveDeliver}
                  onChange={(e) => setRrReceiveDeliver(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Payment type *</Label>
                <SearchableSelect
                  options={paymentTypes.map((p) => ({
                    id: p.id,
                    label: p.name,
                  }))}
                  value={paymentTypeId}
                  onChange={setPaymentTypeId}
                  placeholder="Select payment type…"
                  searchPlaceholder="Search payment types…"
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
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Customer delivery method *</Label>
                <SearchableSelect
                  options={deliveryMethods.map((p) => ({
                    id: p.id,
                    label: p.name,
                  }))}
                  value={customerDeliveryMethodId}
                  onChange={setCustomerDeliveryMethodId}
                  placeholder="Select delivery method…"
                  searchPlaceholder="Search delivery methods…"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-sale-proof">Proof</Label>
                <Input
                  id="edit-sale-proof"
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  disabled={
                    proofUploading ||
                    pending ||
                    proofs.length >= SALE_PROOF_MAX_FILES
                  }
                  onChange={(e) => {
                    void onProofsSelected(e.target.files);
                    e.target.value = "";
                  }}
                />
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
                          onClick={() =>
                            setProofs((prev) =>
                              prev.filter((p) => p.path !== proof.path),
                            )
                          }
                          aria-label={`Remove ${proof.name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={reserved}
                  disabled={!hasRealSerials || pending}
                  onChange={(e) => setReserved(e.target.checked)}
                />
                Reserved (RSV)
                {!hasRealSerials ? (
                  <span className="text-xs text-muted-foreground">
                    (applies after real serials are assigned)
                  </span>
                ) : null}
              </label>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t pt-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || loading}
            onClick={submit}
          >
            Save header
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
