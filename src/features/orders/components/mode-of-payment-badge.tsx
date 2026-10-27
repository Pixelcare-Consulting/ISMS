import { Badge } from "@/components/ui/badge";
import {
  MODE_OF_PAYMENT_KIND_LABELS,
  MODE_OF_PAYMENT_KIND_NOT_SET,
  type ModeOfPaymentKindValue,
} from "@/features/lookups/constants/mode-of-payment-kind";
import { cn } from "@/utils/cn";

interface ModeOfPaymentBadgeProps {
  /** The order's effective mode of payment (see `resolveOrderModeOfPayment`); null when none. */
  modeOfPayment: { name: string; kind: ModeOfPaymentKindValue | null; override: boolean } | null;
  className?: string;
}

const KIND_VARIANTS: Record<ModeOfPaymentKindValue, string> = {
  CONSIGNMENT: "border-amber-200 bg-amber-50 text-amber-900",
  OUTRIGHT: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

/**
 * Consignment / Outright as a chip, with the mode of payment's own name under it. The kind
 * is what decides the SAP document (ITR or SO), so it leads; "override" marks an order
 * that does not use its dealer's mode of payment.
 */
export function ModeOfPaymentBadge({ modeOfPayment, className }: ModeOfPaymentBadgeProps) {
  if (!modeOfPayment) return <span className="text-muted-foreground">—</span>;

  const { name, kind, override } = modeOfPayment;
  const label = kind ? MODE_OF_PAYMENT_KIND_LABELS[kind] : MODE_OF_PAYMENT_KIND_NOT_SET;
  const detail = override ? `${name} · order override` : name;

  return (
    <span className={cn("flex min-w-0 flex-col items-start gap-0.5", className)}>
      <Badge
        variant="outline"
        className={cn(
          "font-normal",
          kind ? KIND_VARIANTS[kind] : "border-dashed text-muted-foreground",
        )}
      >
        {label}
      </Badge>
      <span className="max-w-40 truncate text-xs text-muted-foreground" title={detail}>
        {detail}
      </span>
    </span>
  );
}
