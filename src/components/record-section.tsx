import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

/** White sheet used by Create Order: one card, sections inside, no second chrome. */
export function RecordSheet({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card shadow-sm">
      <div className="space-y-8 p-5 sm:p-6">{children}</div>
      {actions ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/70 px-5 py-4 sm:px-6">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/** Title, one description, then the section body. Later sections draw a top rule. */
export function RecordSection({
  title,
  description,
  action,
  divided = false,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  divided?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className={divided ? "space-y-4 border-t border-border/70 pt-8" : "space-y-5"}>
      <div
        className={cn(
          action && "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        )}
      >
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function RecordFieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">{children}</div>;
}

/** Read-only value, same muted field Create Order uses for dealer and branch. */
export function RecordReadout({
  label,
  value,
  wide = false,
  hint,
  multiline = false,
}: {
  label: string;
  value: ReactNode;
  wide?: boolean;
  hint?: string | null;
  multiline?: boolean;
}) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div
        className={cn(
          "mt-1.5 min-h-10 break-words rounded-lg bg-muted/70 px-3 py-2.5 text-sm font-medium leading-5 text-foreground",
          multiline && "font-normal whitespace-pre-wrap",
        )}
      >
        {value}
      </div>
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Label above an editable control. The control is the value, not a second field. */
export function RecordField({
  label,
  htmlFor,
  wide = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-sm text-muted-foreground">
          {label}
        </label>
      ) : (
        <p className="text-sm text-muted-foreground">{label}</p>
      )}
      <div className="mt-1.5 text-sm font-medium">{children}</div>
    </div>
  );
}
