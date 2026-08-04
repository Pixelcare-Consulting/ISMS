import type { ReactNode } from "react";
import Link from "next/link";

import type { KpiCardTone } from "@/lib/kpi-cards/types";
import { cn } from "@/utils/cn";

export interface KpiCardProps {
  label: ReactNode;
  value: ReactNode;
  href?: string;
  icon?: ReactNode;
  tone?: KpiCardTone;
  hint?: ReactNode;
  className?: string;
}

const toneBorderClass: Record<KpiCardTone, string> = {
  neutral: "",
  info: "border-l-4 border-l-primary",
  warning: "border-l-4 border-l-amber-500",
  danger: "border-l-4 border-l-destructive",
};

const toneValueClass: Record<KpiCardTone, string> = {
  neutral: "",
  info: "text-primary",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-destructive",
};

export function KpiCard({
  label,
  value,
  href,
  icon,
  tone = "neutral",
  hint,
  className,
}: KpiCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm leading-snug text-muted-foreground">{label}</p>
        {icon ? (
          <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          toneValueClass[tone],
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </>
  );

  const cardClassName = cn(
    "rounded-xl border bg-card p-4 shadow-sm",
    toneBorderClass[tone],
    href && "transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cn(cardClassName, "block")}>
        {content}
      </Link>
    );
  }

  return <div className={cardClassName}>{content}</div>;
}
