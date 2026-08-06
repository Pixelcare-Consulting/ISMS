"use client";

import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/utils/cn";

export type ActionProgressStepStatus =
  | "pending"
  | "active"
  | "completed"
  | "failed";

export interface ActionProgressStep {
  id: string;
  label: string;
  hint?: string;
  status: ActionProgressStepStatus;
}

export type ActionProgressPhase = "running" | "success" | "error";

export interface ActionProgressState {
  title: string;
  description?: string;
  steps: ActionProgressStep[];
  phase: ActionProgressPhase;
  errorMessage?: string;
  summary?: string;
}

interface ActionProgressDialogProps {
  state: ActionProgressState | null;
  onClose: () => void;
}

export interface ActionProgressStepDef {
  id: string;
  label: string;
  hint?: string;
}

export interface RunWithActionProgressOptions<T> {
  title: string;
  description?: string;
  steps: ActionProgressStepDef[];
  /** Simulated step advance while the server round-trip is in flight. */
  stepIntervalMs?: number;
  /** Auto-dismiss delay after a successful run. */
  autoCloseMs?: number;
  run: () => Promise<T>;
  /** Soft-fail when the action returns an error payload instead of throwing. */
  getError?: (result: T) => string | null | undefined;
  getSuccessSummary?: (result: T) => string | undefined;
  /** Optional label updates once the result is known (e.g. success/fail counts). */
  mapSuccessSteps?: (
    steps: ActionProgressStepDef[],
    result: T,
  ) => ActionProgressStepDef[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildSteps(
  defs: ActionProgressStepDef[],
  activeIndex: number,
  mode: "running" | "success" | "error",
): ActionProgressStep[] {
  return defs.map((def, index) => {
    if (mode === "success") {
      return { ...def, status: "completed" as const };
    }
    if (mode === "error") {
      if (index < activeIndex) return { ...def, status: "completed" as const };
      if (index === activeIndex) return { ...def, status: "failed" as const };
      return { ...def, status: "pending" as const };
    }
    if (index < activeIndex) return { ...def, status: "completed" as const };
    if (index === activeIndex) return { ...def, status: "active" as const };
    return { ...def, status: "pending" as const };
  });
}

/**
 * Opens a progress dialog, advances a client-side timeline while awaiting a
 * single server round-trip, then completes or fails the checklist.
 */
export async function runWithActionProgress<T>(
  setState: (state: ActionProgressState | null) => void,
  options: RunWithActionProgressOptions<T>,
): Promise<{ ok: true; result: T } | { ok: false; error: string }> {
  const {
    title,
    description,
    steps: stepDefs,
    stepIntervalMs = 750,
    autoCloseMs = 1200,
    run,
    getError,
    getSuccessSummary,
    mapSuccessSteps,
  } = options;

  if (stepDefs.length === 0) {
    throw new Error("runWithActionProgress requires at least one step");
  }

  let activeIndex = 0;
  let settled = false;

  setState({
    title,
    description,
    steps: buildSteps(stepDefs, 0, "running"),
    phase: "running",
  });

  const advanceId = window.setInterval(() => {
    if (settled) return;
    // Keep the final step active until the server responds — don't fake "Done".
    if (activeIndex >= stepDefs.length - 1) return;
    activeIndex += 1;
    setState({
      title,
      description,
      steps: buildSteps(stepDefs, activeIndex, "running"),
      phase: "running",
    });
  }, stepIntervalMs);

  try {
    const result = await run();
    settled = true;
    window.clearInterval(advanceId);

    const softError = getError?.(result);
    if (softError) {
      setState({
        title,
        description,
        steps: buildSteps(stepDefs, activeIndex, "error"),
        phase: "error",
        errorMessage: softError,
      });
      return { ok: false, error: softError };
    }

    const successDefs = mapSuccessSteps?.(stepDefs, result) ?? stepDefs;
    const summary = getSuccessSummary?.(result);
    setState({
      title,
      description,
      steps: buildSteps(successDefs, successDefs.length - 1, "success"),
      phase: "success",
      summary,
    });
    await delay(autoCloseMs);
    setState(null);
    return { ok: true, result };
  } catch (error) {
    settled = true;
    window.clearInterval(advanceId);
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    setState({
      title,
      description,
      steps: buildSteps(stepDefs, activeIndex, "error"),
      phase: "error",
      errorMessage: message,
    });
    return { ok: false, error: message };
  }
}

function StepIcon({ status }: { status: ActionProgressStepStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />;
    case "active":
      return <Loader2 className="size-4 shrink-0 animate-spin text-primary" />;
    case "failed":
      return <XCircle className="size-4 shrink-0 text-destructive" />;
    case "pending":
      return <Circle className="size-4 shrink-0 text-muted-foreground" />;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function RunningElapsedBadge() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <span className="shrink-0 font-mono text-xs text-muted-foreground">
      {elapsedSeconds}s
    </span>
  );
}

export function ActionProgressDialog({
  state,
  onClose,
}: ActionProgressDialogProps) {
  const open = state !== null;
  const phase = state?.phase ?? "running";
  const canDismiss = phase === "success" || phase === "error";

  const completedCount =
    state?.steps.filter((step) => step.status === "completed").length ?? 0;
  const totalSteps = state?.steps.length ?? 0;
  const progressPercent =
    phase === "success"
      ? 100
      : phase === "error"
        ? Math.max(8, Math.round((completedCount / Math.max(totalSteps, 1)) * 100))
        : Math.max(
            8,
            Math.round(
              ((completedCount + (phase === "running" ? 0.45 : 0)) /
                Math.max(totalSteps, 1)) *
                100,
            ),
          );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && canDismiss) onClose();
      }}
    >
      <DialogContent
        className={cn(
          "max-w-md",
          !canDismiss && "[&>button]:hidden",
        )}
        onEscapeKeyDown={(event) => {
          if (!canDismiss) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (!canDismiss) event.preventDefault();
        }}
      >
        {state ? (
          <>
            <DialogHeader>
              <DialogTitle>{state.title}</DialogTitle>
              <DialogDescription>
                {state.description ??
                  (phase === "running"
                    ? "Please wait while this finishes."
                    : phase === "success"
                      ? "Finished successfully."
                      : "Something went wrong.")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-1">
              <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="inline-flex min-w-0 items-center gap-2">
                    {phase === "running" ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                    ) : phase === "success" ? (
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className="size-4 shrink-0 text-destructive" />
                    )}
                    <span className="truncate">
                      {phase === "running"
                        ? "Working…"
                        : phase === "success"
                          ? state.summary ?? "Done"
                          : state.errorMessage ?? "Failed"}
                    </span>
                  </div>
                  {phase === "running" ? (
                    <RunningElapsedBadge key={state.title} />
                  ) : null}
                </div>
                <div
                  aria-hidden
                  className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15"
                >
                  {phase === "running" ? (
                    <div className="h-full w-1/3 animate-[loading-bar_1.35s_ease-in-out_infinite] rounded-full bg-primary" />
                  ) : (
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-300",
                        phase === "success" ? "bg-emerald-600" : "bg-destructive",
                      )}
                      style={{ width: `${progressPercent}%` }}
                    />
                  )}
                </div>
              </div>

              <div className="space-y-2.5 rounded-md border px-3 py-3">
                {state.steps.map((step) => (
                  <div key={step.id} className="space-y-0.5">
                    <div className="inline-flex items-center gap-2 text-sm">
                      <StepIcon status={step.status} />
                      <span
                        className={
                          step.status === "pending"
                            ? "text-muted-foreground"
                            : step.status === "failed"
                              ? "text-destructive"
                              : "text-foreground"
                        }
                      >
                        {step.label}
                      </span>
                    </div>
                    {step.hint && step.status === "active" ? (
                      <p className="pl-6 text-xs text-muted-foreground">
                        {step.hint}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>

              {phase === "error" && state.errorMessage ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {state.errorMessage}
                </p>
              ) : null}
            </div>

            {phase === "error" ? (
              <DialogFooter className="mt-1 sm:justify-end">
                <Button type="button" size="sm" variant="outline" onClick={onClose}>
                  Close
                </Button>
              </DialogFooter>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
