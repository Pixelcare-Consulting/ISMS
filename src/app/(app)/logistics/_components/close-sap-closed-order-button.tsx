"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { closeOrderClosedInSapAction } from "@/features/logistics/actions/logistics.actions";

/** Offered when SAP closed or cancelled the order's SO without a DR. */
export function CloseSapClosedOrderButton({
  deliveryId,
  orderNumber,
  sapSoNumber,
}: {
  deliveryId: string;
  orderNumber: string;
  sapSoNumber: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await closeOrderClosedInSapAction(deliveryId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Order ${result.orderNumber} cancelled and its delivery closed.`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="max-sm:h-11" onClick={() => setOpen(true)}>
        Close order in ISMS
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close order {orderNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              SO {sapSoNumber} was closed in SAP without a DR, so nothing will arrive for this delivery. The order
              becomes Cancelled and this delivery Rejected. SAP is not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep waiting</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                confirm();
              }}
            >
              {pending ? "Closing…" : "Close order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
