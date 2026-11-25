"use client";

import { ConfirmActionButton } from "@/components/confirm-action-button";
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
  return (
    <ConfirmActionButton
      size="sm"
      label="Close order in ISMS"
      title={`Close order ${orderNumber}?`}
      description={`SO ${sapSoNumber} was closed in SAP without a DR, so nothing will arrive for this delivery. The order becomes Cancelled and this delivery Rejected. SAP is not changed.`}
      confirmLabel="Close order"
      pendingLabel="Closing…"
      keepLabel="Keep waiting"
      run={() => closeOrderClosedInSapAction(deliveryId)}
      successMessage={(result) => `Order ${result.orderNumber} cancelled and its delivery closed.`}
    />
  );
}
