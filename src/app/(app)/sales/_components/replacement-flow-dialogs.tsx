"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

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
  completeReplacementNewInvoiceAction,
  completeReplacementSameInvoiceAction,
  listReplacementLookupsAction,
} from "@/features/sales/actions/sales.actions";

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

function todayInputValue(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

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
  const [transactionNo, setTransactionNo] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayInputValue());
  const [loadingLookups, setLoadingLookups] = useState(false);

  useEffect(() => {
    if (!target || !choice) return;
    let cancelled = false;
    startTransition(() => {
      setLoadingLookups(true);
      setModelId("");
      setSerialId("");
      setSerials([]);
      setTransactionNo(target.transactionNo);
      setTransactionDate(todayInputValue());
    });
    void (async () => {
      try {
        const lookups = await listReplacementLookupsAction(target.branchId);
        if (cancelled) return;
        setModels(
          lookups.models.map((m) => ({
            id: m.id,
            label: m.name,
          })),
        );
      } catch {
        if (!cancelled) toast.error("Failed to load models");
      } finally {
        if (!cancelled) setLoadingLookups(false);
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
          lookups.serials.map((r) => ({
            id: r.id,
            label: r.serialNo,
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
    onClose();
  }

  function submitSame() {
    if (!target) return;
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
    if (!target) return;
    if (!transactionNo.trim() || !transactionDate || !modelId || !serialId) {
      toast.error("Transaction no, date, model, and serial are required");
      return;
    }
    startTransition(async () => {
      const res = await completeReplacementNewInvoiceAction({
        returnRequestId: target.returnRequestId,
        transactionNo: transactionNo.trim(),
        transactionDate,
        modelId,
        replacementSerialNumberId: serialId,
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
        <DialogContent className="z-60 max-w-md" overlayClassName="z-60">
          <DialogHeader>
            <DialogTitle>Same Invoice</DialogTitle>
            <DialogDescription>
              Confirm the original TRN, then pick the replacement model and STK
              serial at the sold branch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="same-trn-no">TRN number</Label>
              <Input
                id="same-trn-no"
                value={target?.transactionNo ?? ""}
                readOnly
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="same-trn-date">TRN date</Label>
              <Input
                id="same-trn-date"
                type="date"
                value={toDateInputValue(target?.transactionDate)}
                readOnly
                disabled
              />
            </div>
            <SearchableSelect
              label="Model *"
              options={models}
              value={modelId}
              onChange={setModelId}
              placeholder={loadingLookups ? "Loading…" : "Select model…"}
              disabled={pending || loadingLookups}
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
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setChoice(null)}
            >
              Back
            </Button>
            <Button type="button" disabled={pending} onClick={submitSame}>
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
        <DialogContent className="z-60 max-w-md" overlayClassName="z-60">
          <DialogHeader>
            <DialogTitle>New Invoice</DialogTitle>
            <DialogDescription>
              Enter the new invoice details and replacement STK serial.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="repl-trn-no">Transaction no *</Label>
              <Input
                id="repl-trn-no"
                value={transactionNo}
                onChange={(e) => setTransactionNo(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="repl-trn-date">Date *</Label>
              <Input
                id="repl-trn-date"
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                disabled={pending}
              />
            </div>
            <SearchableSelect
              label="Model *"
              options={models}
              value={modelId}
              onChange={setModelId}
              placeholder={loadingLookups ? "Loading…" : "Select model…"}
              disabled={pending || loadingLookups}
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
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setChoice(null)}
            >
              Back
            </Button>
            <Button type="button" disabled={pending} onClick={submitNew}>
              {pending ? "Working…" : "Confirm replacement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
