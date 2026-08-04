"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  transactionNo,
  branchId,
  currentSerialId,
  currentSerialLabel,
  onClose,
}: {
  saleId: string;
  transactionNo: string;
  branchId: string;
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
    setLoading(true);
    void (async () => {
      try {
        const rows = await listSaleableSerialsAction(branchId);
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
  }, [branchId]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-4 shadow-lg sm:p-6">
        <div>
          <h3 className="text-lg font-semibold">Edit serial</h3>
          <p className="text-sm text-muted-foreground">
            Transaction {transactionNo}. Current: {currentSerialLabel}. Only the
            serial can be changed here.
          </p>
        </div>

        <SearchableSelect
          label="Serial number *"
          options={options}
          value={serialNumberId}
          onChange={setSerialNumberId}
          placeholder={loading ? "Loading serials…" : "Select serial…"}
          searchPlaceholder="Search serials…"
          emptyMessage="No sellable serials at this branch."
          disabled={loading || pending}
        />

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={pending || loading} onClick={save}>
            Save serial
          </Button>
        </div>
      </div>
    </div>
  );
}
