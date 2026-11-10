import { cn } from "@/utils/cn";

type V2MetricVariant = "rose" | "amber" | "white";

interface V2MetricCardProps {
  variant: V2MetricVariant;
  label: string;
  value: number;
  subtext?: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

const variantStyles: Record<V2MetricVariant, string> = {
  rose: "border-rose-200 bg-rose-50/90 dark:border-rose-900/60 dark:bg-rose-950/35",
  amber: "border-amber-200 bg-amber-50/90 dark:border-amber-900/60 dark:bg-amber-950/35",
  white: "border-border bg-card",
};

const labelStyles: Record<V2MetricVariant, string> = {
  rose: "text-rose-900 dark:text-rose-100",
  amber: "text-amber-900 dark:text-amber-100",
  white: "text-foreground",
};

const valueStyles: Record<V2MetricVariant, string> = {
  rose: "text-rose-950 dark:text-rose-50",
  amber: "text-amber-950 dark:text-amber-50",
  white: "text-foreground",
};

export function V2MetricCard({
  variant,
  label,
  value,
  subtext,
  active,
  onClick,
  className,
}: V2MetricCardProps) {
  const interactive = onClick != null;
  const Tag = interactive ? "button" : "div";

  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-xl border p-4 text-left shadow-sm transition-colors",
        variantStyles[variant],
        interactive && "hover:brightness-[0.98] dark:hover:brightness-110",
        active && variant === "rose" && "ring-2 ring-rose-400",
        active && variant === "amber" && "ring-2 ring-amber-400",
        className,
      )}
    >
      <p className={cn("text-sm font-medium", labelStyles[variant])}>{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums tracking-tight", valueStyles[variant])}>
        {(Number.isFinite(value) ? value : 0).toLocaleString()}
      </p>
      {subtext ? <p className="mt-1 text-xs text-muted-foreground">{subtext}</p> : null}
    </Tag>
  );
}
