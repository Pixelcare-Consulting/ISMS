import type { VariantProps } from "class-variance-authority";

import { Badge, badgeVariants } from "@/components/ui/badge";
import { cn } from "@/utils/cn";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

interface TableStatusBadgeProps {
  status: string;
  /** Value treated as “active” → default badge. Defaults to `"active"`. */
  activeValue?: string;
  /** Optional per-status variant map; overrides active/secondary default. */
  variantMap?: Partial<Record<string, BadgeVariant>>;
  /** Display label; defaults to `status`. */
  label?: string;
  className?: string;
}

/**
 * Thin status badge: `active` → default, otherwise secondary (or `variantMap`).
 */
export function TableStatusBadge({
  status,
  activeValue = "active",
  variantMap,
  label,
  className,
}: TableStatusBadgeProps) {
  const mapped = variantMap?.[status];
  const variant: BadgeVariant =
    mapped ?? (status === activeValue ? "default" : "secondary");

  return (
    <Badge variant={variant} className={cn(className)}>
      {label ?? status}
    </Badge>
  );
}
