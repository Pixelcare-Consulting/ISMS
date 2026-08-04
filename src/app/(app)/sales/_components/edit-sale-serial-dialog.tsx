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
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  listSaleableSerialsAction,
  updateSaleSerialAction,
} from "@/features/sales/actions/sales.actions";
import {
  isToFollowSerial,
  TO_FOLLOW_SERIAL_ID,
  TO_FOLLOW_SERIAL_LABEL,
} from "@/features/sales/constants/to-follow-serial";

type SerialOption = {
  id: string;
  serialNo: string;
  skuCode: string;
};

export function EditSaleSerialDialog({
  saleId,
  detailId,
  transactionNo,
  branchId,
  modelId,
  currentSerialId,
  currentSerialLabel,
  onClose,
}: {
  saleId: string;
  detailId?: string;
  transactionNo: string;
  branchId: string;
  modelId: string | null;
  currentSerialId: string | null;
  currentSerialLabel: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [serials, setSerials] = useState<SerialOption[]>([]);
  const [serialNumberId, setSerialNumberId] = useState(
    currentSerialId ?? TO_FOLLOW_SERIAL_ID,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Prefer same-model STK only; if model is unknown, do not list other models.
        const rows = modelId
          ? await listSaleableSerialsAction(branchId, modelId)
          : [];
        if (cancelled) return;
        setSerials(rows);
      } catch {
        if (cancelled) return;
        toast.error("Failed to load serials");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId, modelId]);

  const options = [
    { id: TO_FOLLOW_SERIAL_ID, label: TO_FOLLOW_SERIAL_LABEL },
    ...serials.map((s) => ({
      id: s.id,
      label: `${s.serialNo} · ${s.skuCode}`,
    })),
  ];

  function save() {
    if (!serialNumberId) {
      toast.error("Select a serial");
      return;
    }
    startTransition(async () => {
      const result = await updateSaleSerialAction({
        saleId,
        detailId,
        serialNumberId,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        isToFollowSerial(serialNumberId)
          ? "Serial set to TO-FOLLOW"
          : "Serial updated",
      );
      onClose();
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !pending) onClose();
      }}
    >
      <DialogContent className="z-60 sm:max-w-md" overlayClassName="z-60">
        <DialogHeader>
          <DialogTitle>Edit serial</DialogTitle>
          <DialogDescription>
            Transaction {transactionNo}. Current: {currentSerialLabel}. Only the
            serial can be changed here.
          </DialogDescription>
        </DialogHeader>

        <SearchableSelect
          label="Serial number *"
          options={options}
          value={serialNumberId}
          onChange={setSerialNumberId}
          placeholder={loading ? "Loading serials…" : "Select serial…"}
          searchPlaceholder="Search serials…"
          emptyMessage="No sellable serials for this product model at this branch."
          disabled={loading || pending}
          popoverClassName="z-70"
        />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="button" disabled={pending || loading} onClick={save}>
            Save serial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
