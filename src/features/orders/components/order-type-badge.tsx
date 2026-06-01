import type { BranchOrderType } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { BRANCH_ORDER_TYPE_LABELS } from "@/features/orders/constants/order-status";
import { cn } from "@/utils/cn";

interface OrderTypeBadgeProps {
  orderType: BranchOrderType | string;
  className?: string;
}

const ORDER_TYPE_VARIANTS: Record<string, string> = {
  manual: "border-sky-200 bg-sky-50 text-sky-800",
  special: "border-violet-200 bg-violet-50 text-violet-800",
  auto_replenish: "border-teal-200 bg-teal-50 text-teal-800",
};

export function OrderTypeBadge({ orderType, className }: OrderTypeBadgeProps) {
  const label =
    orderType in BRANCH_ORDER_TYPE_LABELS
      ? BRANCH_ORDER_TYPE_LABELS[orderType as BranchOrderType]
      : orderType;
  const variant = ORDER_TYPE_VARIANTS[orderType] ?? "border-border bg-background text-foreground";

  return (
    <Badge variant="outline" className={cn("font-normal", variant, className)}>
      {label}
    </Badge>
  );
}
