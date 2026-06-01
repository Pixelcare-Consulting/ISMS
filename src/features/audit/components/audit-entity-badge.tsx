import { Badge } from "@/components/ui/badge";
import {
  formatAuditEntityTypeLabel,
  getAuditEntityBadgeClassName,
} from "@/features/audit/constants/audit-display";
import { cn } from "@/utils/cn";

interface AuditEntityBadgeProps {
  entityType: string;
  className?: string;
}

export function AuditEntityBadge({
  entityType,
  className,
}: AuditEntityBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        getAuditEntityBadgeClassName(entityType),
        className,
      )}
    >
      {formatAuditEntityTypeLabel(entityType)}
    </Badge>
  );
}
