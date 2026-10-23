"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { SaleSerialField } from "@/app/(app)/sales/_components/sale-serial-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateSaleSerialAction } from "@/features/sales/actions/sales.actions";
import {
  isToFollowSerial,
  TO_FOLLOW_SERIAL_ID,
} from "@/features/sales/constants/to-follow-serial";

export function EditSaleSerialDialog({
  saleId,
  detailId,
  transactionNo,
  branchId,
  modelId,
  currentSerialId,
  currentSerialLabel,
  currentDeliveryNo,
  currentDeliveryDate,
  showDelivery,
  onClose,
}: {
  saleId: string;
  detailId?: string;
  transactionNo: string;
  branchId: string;
  modelId: string | null;
  currentSerialId: string | null;
  currentSerialLabel: string;
  currentDeliveryNo: string | null;
  /** YYYY-MM-DD. */
  currentDeliveryDate: string | null;
  /** False for pickup sales, which never produce a delivery receipt. */
  showDelivery: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  // The line is already TO-FOLLOW. Keep that choice; do not replace it when
  // the lookup is loading, empty, or failed.
  const [serialNumberId, setSerialNumberId] = useState(
    currentSerialId ?? TO_FOLLOW_SERIAL_ID,
  );
  const [deliveryNo, setDeliveryNo] = useState(currentDeliveryNo ?? "");
  const [deliveryDate, setDeliveryDate] = useState(currentDeliveryDate ?? "");

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
        ...(showDelivery ? { deliveryNo, deliveryDate } : {}),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const serialChanged =
        serialNumberId !== (currentSerialId ?? TO_FOLLOW_SERIAL_ID);
      toast.success(
        !serialChanged && showDelivery
          ? "Delivery updated"
          : isToFollowSerial(serialNumberId)
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
          <DialogTitle>{showDelivery ? "Edit line" : "Edit serial"}</DialogTitle>
          <DialogDescription>
            Transaction {transactionNo}. Current serial: {currentSerialLabel}.
            {showDelivery
              ? " Only the serial and delivery can be changed here."
              : " Only the serial can be changed here."}
          </DialogDescription>
        </DialogHeader>

        <SaleSerialField
          stockBranchId={branchId}
          modelId={modelId ?? ""}
          value={serialNumberId}
          onChange={(serial) => setSerialNumberId(serial.id)}
          disabled={pending}
          popoverClassName="z-70"
          id="edit-sale-serial"
        />

        {showDelivery ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-delivery-no">Delivery number</Label>
              <Input
                id="edit-delivery-no"
                value={deliveryNo}
                onChange={(e) => setDeliveryNo(e.target.value)}
                placeholder="Delivery number"
                autoComplete="off"
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-delivery-date">Delivery date</Label>
              <Input
                id="edit-delivery-date"
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={save}>
            {showDelivery ? "Save line" : "Save serial"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
