import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import type { SaleStatusCodeRef } from "@/features/sales/actions/sales.actions";

/** Fallback when Settings sales_atr codes are not loaded (e.g. unused badge paths). */
const ATR_STATUS_FALLBACK: Record<string, SaleStatusCodeRef> = {
  open: { code: "open", name: "Open", color: "sky" },
  reserve: { code: "reserve", name: "Reserve", color: "amber" },
  closed: { code: "closed", name: "Closed", color: "slate" },
};

const RETURN_STATUS_FALLBACK: Record<string, SaleStatusCodeRef> = {
  pending_cs: { code: "pending_cs", name: "Pending CS", color: "amber" },
  pending_tl: { code: "pending_tl", name: "Pending TL", color: "amber" },
  approved: { code: "approved", name: "Approved", color: "emerald" },
  rejected: { code: "rejected", name: "Rejected", color: "rose" },
  completed: { code: "completed", name: "Completed", color: "emerald" },
};

interface AtrStatusBadgeProps {
  status: string;
  /** Prefer Settings-resolved display from getSaleDetailsAction / listSalesAction. */
  statusCode?: SaleStatusCodeRef | null;
  className?: string;
}

export function AtrStatusBadge({
  status,
  statusCode,
  className,
}: AtrStatusBadgeProps) {
  const resolved =
    statusCode ??
    ATR_STATUS_FALLBACK[status] ?? {
      code: status,
      name: status,
      color: null,
    };

  return (
    <StatusCodeBadge
      code={resolved.code}
      name={resolved.name}
      color={resolved.color}
      className={className}
    />
  );
}

interface ReturnStatusBadgeProps {
  status: string | null | undefined;
  /** Prefer Settings-resolved display from getSaleDetailsAction / listSalesAction. */
  statusCode?: SaleStatusCodeRef | null;
  className?: string;
}

export function ReturnStatusBadge({
  status,
  statusCode,
  className,
}: ReturnStatusBadgeProps) {
  if (!status) {
    return <span className="text-muted-foreground">—</span>;
  }

  const resolved =
    statusCode ??
    RETURN_STATUS_FALLBACK[status] ?? {
      code: status,
      name: status.replaceAll("_", " "),
      color: "amber",
    };

  return (
    <StatusCodeBadge
      code={resolved.code}
      name={resolved.name}
      color={resolved.color}
      className={className}
    />
  );
}
