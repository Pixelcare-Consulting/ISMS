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
  DELIVERY_TRANSFER_STATUS_COLORS,
  DELIVERY_TRANSFER_STATUS_LABELS,
} from "@/features/logistics/constants/delivery-workflow-labels";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";

export function DeliveryTransferStatusBadge({ status }: { status: DeliveryTransferStatus }) {
  return (
    <StatusCodeBadge
      code={status}
      name={DELIVERY_TRANSFER_STATUS_LABELS[status]}
      color={DELIVERY_TRANSFER_STATUS_COLORS[status]}
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

export function DeliveryReturnStatusBadge({ status }: { status: DeliveryReturnStatus }) {
  return (
    <StatusCodeBadge
      code={status}
      name={DELIVERY_RETURN_STATUS_LABELS[status]}
      color={DELIVERY_RETURN_STATUS_COLORS[status]}
    />
  );
}
