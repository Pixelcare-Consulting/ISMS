import type { BranchOrderStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { BRANCH_ORDER_STATUS_LABELS } from "@/features/orders/constants/order-status";
import { cn } from "@/utils/cn";

/** Soft pastel outline classes per BranchOrderStatus — shared by lists and workflow UI. */
export const ORDER_STATUS_VARIANTS: Record<BranchOrderStatus, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  pending_ps: "border-amber-200 bg-amber-50 text-amber-800",
  pending_tl: "border-amber-200 bg-amber-50 text-amber-800",
  pending_sp: "border-amber-200 bg-amber-50 text-amber-800",
  pending_logistics: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-rose-200 bg-rose-50 text-rose-800",
  cancelled: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

const FALLBACK_VARIANT = "border-border bg-background text-foreground";

interface OrderStatusBadgeProps {
  status: BranchOrderStatus | string;
  className?: string;
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const label =
    status in BRANCH_ORDER_STATUS_LABELS
      ? BRANCH_ORDER_STATUS_LABELS[status as BranchOrderStatus]
      : status;
  const variant =
    status in ORDER_STATUS_VARIANTS
      ? ORDER_STATUS_VARIANTS[status as BranchOrderStatus]
      : FALLBACK_VARIANT;

  return (
    <Badge variant="outline" className={cn("font-normal", variant, className)}>
      {label}
    </Badge>
  );
}
