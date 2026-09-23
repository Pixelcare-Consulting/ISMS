import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/utils/cn";

export function WizardFieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

export function WizardField({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function WizardReadonlyValue({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}
