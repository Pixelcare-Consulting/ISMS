"use client";

import type { DemandPlanningRunStatus } from "@prisma/client";
import type { ReactNode } from "react";
import { Check } from "lucide-react";

import { DemandPlanningChromeBar } from "@/app/(app)/planning/_components/demand-planning-chrome-bar";
import { DEMAND_PLANNING_RUNS_PATH } from "@/features/demand-planning/lib/paths";
import { cn } from "@/utils/cn";

export type DemandPlanningWizardStep = 1 | 2 | 3 | 4;

const STEPS: Array<{
  n: DemandPlanningWizardStep;
  title: string;
  caption: string;
}> = [
  { n: 1, title: "Scope", caption: "Period, branches, frequency" },
  { n: 2, title: "Parameters", caption: "Quota, min level, rounding" },
  { n: 3, title: "Data sources", caption: "Planogram, forecast, on-hand" },
  { n: 4, title: "Run & review", caption: "Totals and next steps" },
];

export function DemandPlanningWizardShell({
  actorName,
  step,
  maxReached,
  title,
  description,
  children,
  back,
  next,
  onSelectStep,
  onClose,
  embedded = false,
  stepMeta,
  status = "draft",
}: {
  actorName: string;
  step: DemandPlanningWizardStep;
  maxReached: DemandPlanningWizardStep;
  title: string;
  description: string;
  children: ReactNode;
  back: ReactNode;
  next: ReactNode;
  onSelectStep: (nextStep: DemandPlanningWizardStep) => void;
  onClose?: () => void;
  embedded?: boolean;
  /** Extra footer copy after “Step N of 4”, e.g. run elapsed time. */
  stepMeta?: string;
  status?: DemandPlanningRunStatus;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[32rem] flex-col overflow-hidden bg-card",
        embedded ? "max-h-[90vh]" : "rounded-xl border shadow-sm",
      )}
    >
      <DemandPlanningChromeBar
        crumbs={[
          { label: "Settings", href: "/settings/planning" },
          { label: "Demand Planning", href: DEMAND_PLANNING_RUNS_PATH },
          { label: "New run" },
        ]}
        status={status}
        actorName={actorName}
        onClose={onClose}
      />
      <div className="flex min-h-0 flex-1 flex-row">
        <aside className="w-40 shrink-0 border-r bg-muted/40 px-2.5 py-4 sm:w-56 sm:px-3 sm:py-5">
          <ol className="flex flex-col gap-0">
            {STEPS.map((item, index) => {
              const current = item.n === step;
              const done = item.n !== step && item.n <= maxReached;
              const reachable = step === 4 ? current : item.n <= maxReached;
              return (
                <li key={item.n} className="block">
                  <button
                    type="button"
                    disabled={!reachable}
                    aria-current={current ? "step" : undefined}
                    onClick={() => onSelectStep(item.n)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-md px-1 py-1 text-left",
                      reachable ? "hover:bg-muted/80" : "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                        current
                          ? "border-foreground bg-foreground text-background"
                          : done
                            ? "border-foreground bg-foreground text-background"
                            : "border-muted-foreground/40 text-muted-foreground",
                      )}
                    >
                      {done && !current ? <Check className="size-3.5" /> : item.n}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block text-sm font-medium leading-tight",
                          current ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {item.title}
                      </span>
                      <span className="mt-0.5 hidden text-[11px] leading-snug text-muted-foreground sm:block">
                        {item.caption}
                      </span>
                    </span>
                  </button>
                  {index < STEPS.length - 1 ? (
                    <span
                      className="ml-0.8125rem block h-4 w-px bg-border"
                      aria-hidden
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="shrink-0 border-b px-5 py-4 sm:px-6">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-5 py-3 sm:px-6">
            {step === 4 ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {back}
                  {next}
                </div>
                <p className="text-xs text-muted-foreground">
                  Step {step} of 4
                  {stepMeta ? ` · ${stepMeta}` : ""}
                </p>
              </>
            ) : (
              <>
                <div>{back}</div>
                <p className="order-last w-full text-center text-xs text-muted-foreground sm:order-none sm:w-auto">
                  Step {step} of 4
                </p>
                <div className="flex flex-wrap justify-end gap-2">{next}</div>
              </>
            )}
          </footer>
        </div>
      </div>
    </div>
  );
}
