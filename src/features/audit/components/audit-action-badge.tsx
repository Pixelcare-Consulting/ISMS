import { Badge } from "@/components/ui/badge";
import {
  formatAuditActionLabel,
  getAuditActionBadgeClassName,
} from "@/features/audit/constants/audit-display";
import { cn } from "@/utils/cn";

interface AuditActionBadgeProps {
  action: string;
  className?: string;
}

export function AuditActionBadge({ action, className }: AuditActionBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        getAuditActionBadgeClassName(action),
        className,
      )}
    >
      {formatAuditActionLabel(action)}
    </Badge>
  );
}
