"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  ReplacementInvoiceHeaderFields,
  type ReplacementHeaderLookup,
  type ReplacementInvoiceHeaderValue,
  type ReplacementProofAttachment,
} from "@/app/(app)/sales/_components/replacement-invoice-header-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  completeReplacementNewInvoiceAction,
  completeReplacementSameInvoiceAction,
  getSaleDetailsAction,
  listCustomerDeliveryMethodsForSalesAction,
  listPaymentTypesForSalesAction,
  listReplacementLookupsAction,
  listSaleTypesForSalesAction,
  uploadSaleProofAction,
} from "@/features/sales/actions/sales.actions";
import { SALE_PROOF_MAX_FILES, saleProofFileName } from "@/features/sales/utils/sale-proof";
import { earliestSaleTransactionIso } from "@/features/sales/utils/transaction-date";

type ReplacementChoice = "same" | "new" | null;

export type ReplacementFlowTarget = {
  returnRequestId: string;
  saleId: string;
  transactionNo: string;
  /** ISO datetime from the original sale (for Same Invoice verification). */
  transactionDate: string | null;
  branchId: string;
  branchName: string;
};

type ReplacementFlowDialogsProps = {
  target: ReplacementFlowTarget | null;
  onClose: () => void;
  onCompleted: () => void;
};

const EMPTY_HEADER: ReplacementInvoiceHeaderValue = {
  transactionNo: "",
  branchSoldName: "",
  alternateBranchName: "",
  transactionDate: "",
  customerName: "",
  contactNo: "",
  infoSlipVsoRrReleased: "",
  rrReceiveDeliver: "",
  paymentTypeId: "",
  saleTypeId: "",
  customerDeliveryMethodId: "",
  proofs: [],
};

/** YYYY-MM-DD for date inputs without timezone drift. */
function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const dayPrefix = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  if (dayPrefix) return dayPrefix[1]!;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function withCurrentOption(
  options: ReplacementHeaderLookup[],
  current: { id: string; name: string } | null | undefined,
): ReplacementHeaderLookup[] {
  if (!current?.id || !current.name) return options;
  if (options.some((option) => option.id === current.id)) return options;
  return [current, ...options];
}

function ReplacementFormSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Loading sale">
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ReplacementFlowDialogs({
  target,
  onClose,
  onCompleted,
}: ReplacementFlowDialogsProps) {
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<ReplacementChoice>(null);
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [serials, setSerials] = useState<{ id: string; label: string }[]>([]);
  const [modelId, setModelId] = useState("");
  const [serialId, setSerialId] = useState("");
  const [header, setHeader] = useState<ReplacementInvoiceHeaderValue>(EMPTY_HEADER);
  const [paymentTypes, setPaymentTypes] = useState<ReplacementHeaderLookup[]>([]);
  const [saleTypes, setSaleTypes] = useState<ReplacementHeaderLookup[]>([]);
  const [deliveryMethods, setDeliveryMethods] = useState<ReplacementHeaderLookup[]>([]);
  const [headerLoading, setHeaderLoading] = useState(false);
  const [headerReady, setHeaderReady] = useState(false);
  const [proofUploading, setProofUploading] = useState(false);

  useEffect(() => {
    if (!target || !choice) return;
    let cancelled = false;
    startTransition(() => {
      setHeaderLoading(true);
      setHeaderReady(false);
      setHeader(EMPTY_HEADER);
      setModelId("");
      setSerialId("");
      setSerials([]);
    });
    void (async () => {
      try {
        const [lookups, sale, paymentRows, saleTypeRows, deliveryRows] =
          await Promise.all([
            listReplacementLookupsAction(target.branchId),
            getSaleDetailsAction(target.saleId),
            listPaymentTypesForSalesAction(),
            listSaleTypesForSalesAction(),
            listCustomerDeliveryMethodsForSalesAction(),
          ]);
        if (cancelled) return;
        if ("error" in sale) {
          toast.error(sale.error);
          return;
        }
        const nextModels = lookups.models.map((model) => ({
          id: model.id,
          label: model.name,
        }));
        setModels(nextModels);
        setModelId((current) =>
          current && !nextModels.some((model) => model.id === current) ? "" : current,
        );
        setPaymentTypes(withCurrentOption(paymentRows, sale.paymentType));
        setSaleTypes(withCurrentOption(saleTypeRows, sale.saleType));
        setDeliveryMethods(
          withCurrentOption(deliveryRows, sale.customerDeliveryMethod),
        );
        setHeader({
          transactionNo: sale.transactionNo,
          branchSoldName: sale.branch.name || target.branchName,
          alternateBranchName:
            sale.stockSourceBranch?.name ?? sale.branch.name ?? target.branchName,
          transactionDate:
            sale.transactionDateInput ??
            (toDateInputValue(sale.transactionDate) ||
              toDateInputValue(target.transactionDate)),
          customerName: sale.customerName ?? "",
          contactNo: sale.contactNo ?? "",
          infoSlipVsoRrReleased: sale.infoSlipVsoRrReleased ?? "",
          rrReceiveDeliver: sale.rrReceiveDeliver ?? "",
          paymentTypeId: sale.paymentTypeId ?? "",
          saleTypeId: sale.saleTypeId ?? "",
          customerDeliveryMethodId: sale.customerDeliveryMethodId ?? "",
          proofs: sale.proofPaths.map((path) => ({
            path,
            name: saleProofFileName(path),
          })),
        });
        setHeaderReady(true);
      } catch {
        if (!cancelled) toast.error("Failed to load the original sale");
      } finally {
        if (!cancelled) setHeaderLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target, choice]);

  useEffect(() => {
    if (!target || !choice || !modelId) return;
    let cancelled = false;
    void (async () => {
      try {
        const lookups = await listReplacementLookupsAction(
          target.branchId,
          modelId,
        );
        if (cancelled) return;
        setSerials(
          lookups.serials.map((row) => ({
            id: row.id,
            label: row.serialNo,
          })),
        );
        setSerialId("");
      } catch {
        if (!cancelled) toast.error("Failed to load stock serials");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target, choice, modelId]);

  function handleClose() {
    if (pending) return;
    setChoice(null);
    setHeaderReady(false);
    onClose();
  }

  function patchHeader(patch: Partial<ReplacementInvoiceHeaderValue>) {
    setHeader((current) => ({ ...current, ...patch }));
  }

  async function onProofsSelected(fileList: FileList | null) {
    if (!fileList?.length || choice !== "new") return;
    const remaining = SALE_PROOF_MAX_FILES - header.proofs.length;
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
      const uploaded: ReplacementProofAttachment[] = result.paths.map(
        (path, index) => ({
          path,
          name: selected[index]?.name ?? saleProofFileName(path),
        }),
      );
      setHeader((current) => ({
        ...current,
        proofs: [...current.proofs, ...uploaded],
      }));
      toast.success(
        uploaded.length === 1
          ? "Proof uploaded"
          : `${uploaded.length} proof files uploaded`,
      );
    } finally {
      setProofUploading(false);
    }
  }

  function submitSame() {
    if (!target || !headerReady) return;
    if (!modelId || !serialId) {
      toast.error("Model and serial are required");
      return;
    }
    startTransition(async () => {
      const res = await completeReplacementSameInvoiceAction({
        returnRequestId: target.returnRequestId,
        modelId,
        replacementSerialNumberId: serialId,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Replacement completed (same invoice)");
      setChoice(null);
      onCompleted();
    });
  }

  function submitNew() {
    if (!target || !headerReady) return;
    if (!header.transactionNo.trim()) {
      toast.error("Transaction number is required");
      return;
    }
    if (
      header.transactionDate &&
      header.transactionDate < earliestSaleTransactionIso()
    ) {
      toast.error("Transaction date cannot be more than 30 days before today");
      return;
    }
    if (!header.customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (!header.paymentTypeId) {
      toast.error("Payment type is required");
      return;
    }
    if (!header.saleTypeId) {
      toast.error("Sale type is required");
      return;
    }
    if (!header.customerDeliveryMethodId) {
      toast.error("Customer delivery method is required");
      return;
    }
    if (!modelId || !serialId) {
      toast.error("Model and serial are required");
      return;
    }
    startTransition(async () => {
      const res = await completeReplacementNewInvoiceAction({
        returnRequestId: target.returnRequestId,
        transactionNo: header.transactionNo.trim(),
        transactionDate: header.transactionDate || undefined,
        modelId,
        replacementSerialNumberId: serialId,
        customerName: header.customerName.trim(),
        contactNo: header.contactNo.trim() || undefined,
        paymentTypeId: header.paymentTypeId,
        saleTypeId: header.saleTypeId,
        customerDeliveryMethodId: header.customerDeliveryMethodId,
        infoSlipVsoRrReleased: header.infoSlipVsoRrReleased.trim() || undefined,
        rrReceiveDeliver: header.rrReceiveDeliver.trim() || undefined,
        proof: header.proofs.map((proof) => proof.path),
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Replacement completed (new invoice)");
      setChoice(null);
      onCompleted();
    });
  }

  const invoiceDialogClassName =
    "z-60 flex max-h-[min(90svh,calc(100svh-2rem))] w-[min(calc(100vw-2rem),42rem)] max-w-2xl flex-col gap-0 overflow-hidden p-4 sm:p-6";

  return (
    <>
      <Dialog
        open={target !== null && choice === null}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
      >
        <DialogContent className="z-60 max-w-md" overlayClassName="z-60">
          <DialogHeader>
            <DialogTitle>Complete replacement</DialogTitle>
            <DialogDescription>
              Choose how to issue the replacement unit for transaction{" "}
              <span className="font-medium text-foreground">
                {target?.transactionNo}
              </span>{" "}
              at {target?.branchName}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setChoice("same")}
            >
              Same Invoice
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => setChoice("new")}
            >
              New Invoice
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={target !== null && choice === "same"}
        onOpenChange={(open) => {
          if (!open && !pending) setChoice(null);
        }}
      >
        <DialogContent className={invoiceDialogClassName} overlayClassName="z-60">
          <DialogHeader className="shrink-0 space-y-1.5 pr-8 pb-4 text-left">
            <DialogTitle>Same Invoice</DialogTitle>
            <DialogDescription>
              These details are from the original sale and stay as they are.
              Then pick the replacement model and serial.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1">
            {headerLoading ? (
              <ReplacementFormSkeleton />
            ) : headerReady ? (
              <>
                <ReplacementInvoiceHeaderFields
                  idPrefix="same"
                  readOnly
                  pending={pending}
                  value={header}
                  onChange={patchHeader}
                  paymentTypes={paymentTypes}
                  saleTypes={saleTypes}
                  deliveryMethods={deliveryMethods}
                  proofUploading={false}
                  onProofsSelected={() => undefined}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <SearchableSelect
                    label="Model *"
                    options={models}
                    value={modelId}
                    onChange={setModelId}
                    placeholder={
                      models.length === 0
                        ? "No stock at this branch"
                        : "Select model…"
                    }
                    emptyMessage="No stock at this branch."
                    disabled={pending}
                    popoverClassName="z-70"
                  />
                  <SearchableSelect
                    label="Serial number *"
                    options={serials}
                    value={serialId}
                    onChange={setSerialId}
                    placeholder={
                      modelId ? "Select STK serial…" : "Select a model first…"
                    }
                    disabled={pending || !modelId}
                    popoverClassName="z-70"
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                The original sale could not be loaded. Go back and try again.
              </p>
            )}
          </div>
          <DialogFooter className="mt-4 shrink-0 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setChoice(null)}
            >
              Back
            </Button>
            <Button
              type="button"
              disabled={pending || headerLoading || !headerReady}
              onClick={submitSame}
            >
              {pending ? "Working…" : "Confirm replacement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={target !== null && choice === "new"}
        onOpenChange={(open) => {
          if (!open && !pending) setChoice(null);
        }}
      >
        <DialogContent className={invoiceDialogClassName} overlayClassName="z-60">
          <DialogHeader className="shrink-0 space-y-1.5 pr-8 pb-4 text-left">
            <DialogTitle>New Invoice</DialogTitle>
            <DialogDescription>
              The original sale details are filled in. You can change them,
              except the branches stay with this sale. Then pick the replacement
              unit.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1">
            {headerLoading ? (
              <ReplacementFormSkeleton />
            ) : headerReady ? (
              <>
                <ReplacementInvoiceHeaderFields
                  idPrefix="repl"
                  readOnly={false}
                  pending={pending}
                  value={header}
                  onChange={patchHeader}
                  paymentTypes={paymentTypes}
                  saleTypes={saleTypes}
                  deliveryMethods={deliveryMethods}
                  proofUploading={proofUploading}
                  onProofsSelected={(files) => {
                    void onProofsSelected(files);
                  }}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <SearchableSelect
                    label="Model *"
                    options={models}
                    value={modelId}
                    onChange={setModelId}
                    placeholder={
                      models.length === 0
                        ? "No stock at this branch"
                        : "Select model…"
                    }
                    emptyMessage="No stock at this branch."
                    disabled={pending}
                    popoverClassName="z-70"
                  />
                  <SearchableSelect
                    label="Serial number *"
                    options={serials}
                    value={serialId}
                    onChange={setSerialId}
                    placeholder={
                      modelId ? "Select STK serial…" : "Select a model first…"
                    }
                    disabled={pending || !modelId}
                    popoverClassName="z-70"
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                The original sale could not be loaded. Go back and try again.
              </p>
            )}
          </div>
          <DialogFooter className="mt-4 shrink-0 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setChoice(null)}
            >
              Back
            </Button>
            <Button
              type="button"
              disabled={pending || headerLoading || !headerReady || proofUploading}
              onClick={submitNew}
            >
              {pending ? "Working…" : "Confirm replacement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
