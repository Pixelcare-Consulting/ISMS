import type { BranchOrderSource } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { BRANCH_ORDER_SOURCE_LABELS } from "@/features/orders/constants/order-status";
import { cn } from "@/utils/cn";

/** ISMS orders stay plain; a Sales Order made in SAP stands out. */
const SOURCE_VARIANTS: Record<BranchOrderSource, string> = {
  ISMS: "border-border bg-background text-muted-foreground",
  SAP: "border-amber-300 bg-amber-50 text-amber-900",
};

export function OrderSourceBadge({
  source,
  className,
}: {
  source: BranchOrderSource | null | undefined;
  className?: string;
}) {
  const value: BranchOrderSource = source ?? "ISMS";
  return (
    <Badge variant="outline" className={cn("font-normal", SOURCE_VARIANTS[value], className)}>
      {BRANCH_ORDER_SOURCE_LABELS[value]}
    </Badge>
  );
}
