import { Badge } from "@/components/ui/badge";
import {
  MODE_OF_PAYMENT_KIND_LABELS,
  MODE_OF_PAYMENT_KIND_NOT_SET,
  type ModeOfPaymentKindValue,
} from "@/features/lookups/constants/mode-of-payment-kind";
import type { ResolvedOrderModeOfPayment } from "@/features/orders/constants/order-sap-doc-type";
import { cn } from "@/utils/cn";

interface ModeOfPaymentBadgeProps {
  /** The order's effective mode of payment (see `resolveOrderModeOfPayment`); null when none. */
  modeOfPayment: ResolvedOrderModeOfPayment | null;
  className?: string;
}

const KIND_VARIANTS: Record<ModeOfPaymentKindValue, string> = {
  CONSIGNMENT: "border-amber-200 bg-amber-50 text-amber-900",
  OUTRIGHT: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

/**
 * The mode of payment's name as a chip, colored by its kind (Consignment / Outright),
 * which is what decides the SAP document (ITR or SO). The kind, and whether the order
 * overrides its dealer's mode of payment, show on hover.
 */
export function ModeOfPaymentBadge({ modeOfPayment, className }: ModeOfPaymentBadgeProps) {
  if (!modeOfPayment) return <span className="text-muted-foreground">—</span>;

  const { name, kind, override } = modeOfPayment;
  const kindLabel = kind ? MODE_OF_PAYMENT_KIND_LABELS[kind] : `Kind ${MODE_OF_PAYMENT_KIND_NOT_SET.toLowerCase()}`;
  const title = override ? `${kindLabel} · order override` : kindLabel;

  return (
    <Badge
      variant="outline"
      title={title}
      className={cn(
        "max-w-40 truncate font-normal",
        kind ? KIND_VARIANTS[kind] : "border-dashed text-muted-foreground",
        className,
      )}
    >
      {name}
    </Badge>
  );
}
