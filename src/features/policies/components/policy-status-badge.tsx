import { Badge } from "@/components/ui/badge";
import {
  POLICY_STATUS_LABELS,
  type PolicyStatus,
} from "@/features/policies/constants/policy-status";
import { cn } from "@/utils/cn";

interface PolicyStatusBadgeProps {
  status: string;
  className?: string;
}

const statusVariant: Record<PolicyStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  review:
    "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  approved:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
};

export function PolicyStatusBadge({ status, className }: PolicyStatusBadgeProps) {
  const typed = status as PolicyStatus;
  const label = POLICY_STATUS_LABELS[typed] ?? status;

  return (
    <Badge
      variant="secondary"
      className={cn("font-medium", statusVariant[typed], className)}
    >
      {label}
    </Badge>
  );
}
