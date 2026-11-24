"use client";

import { ConfirmActionButton } from "@/components/confirm-action-button";
import { cancelApprovedOrderAction } from "@/features/orders/actions/order.actions";

/** Supply Planning's Cancel on an approved order: closes its ITR/SO in SAP first. */
export function CancelApprovedOrderButton({
  orderId,
  orderNumber,
  sapDocLabel,
}: {
  orderId: string;
  orderNumber: string;
  /** "ITR 372656" or "SO 25488". */
  sapDocLabel: string;
}) {
  return (
    <ConfirmActionButton
      label="Cancel order"
      title={`Cancel order ${orderNumber}?`}
      description={`${sapDocLabel} will be closed in SAP, so nothing more can be copied from it. The order becomes Cancelled and its delivery Rejected. ISMS refuses if SAP already copied any of it to an IT or DR.`}
      confirmLabel="Cancel order"
      pendingLabel="Closing in SAP…"
      run={() => cancelApprovedOrderAction(orderId)}
      successMessage={({ sapDocument }) =>
        `Order ${orderNumber} cancelled. ${sapDocument.type} ${sapDocument.docNum} is closed in SAP.`
      }
    />
  );
}
