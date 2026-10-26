import type {
  DeliveryReturnStatus,
  DeliveryTransferLineStatus,
  DeliveryTransferStatus,
} from "@prisma/client";

import {
  DELIVERY_RETURN_STATUS_COLORS,
  DELIVERY_RETURN_STATUS_LABELS,
  DELIVERY_TRANSFER_LINE_STATUS_COLORS,
  DELIVERY_TRANSFER_LINE_STATUS_LABELS,
} from "@/features/logistics/constants/delivery-workflow-labels";
import {
  unitTransferStatusPresentation,
  type WorkflowStatusOption,
} from "@/features/logistics/constants/workflow-codes";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";

export function DeliveryTransferStatusBadge({
  status,
  catalog = [],
}: {
  status: DeliveryTransferStatus;
  catalog?: readonly WorkflowStatusOption[];
}) {
  const presentation = unitTransferStatusPresentation(status, catalog);
  return (
    <StatusCodeBadge
      code={presentation.code}
      name={presentation.name}
      color={presentation.color}
    />
  );
}

export function DeliveryTransferLineStatusBadge({ status }: { status: DeliveryTransferLineStatus }) {
  return (
    <StatusCodeBadge
      code={status}
      name={DELIVERY_TRANSFER_LINE_STATUS_LABELS[status]}
      color={DELIVERY_TRANSFER_LINE_STATUS_COLORS[status]}
    />
  );
}

/** Return requests keep their own document states. They are not Delivery workflow codes. */
export function DeliveryReturnStatusBadge({ status }: { status: DeliveryReturnStatus }) {
  return (
    <StatusCodeBadge
      code={status}
      name={DELIVERY_RETURN_STATUS_LABELS[status]}
      color={DELIVERY_RETURN_STATUS_COLORS[status]}
    />
  );
}
