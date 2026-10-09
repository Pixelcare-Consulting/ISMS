"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useSapSyncStore,
  type SapSyncProgress,
  type SapSyncProgressPhase,
} from "@/features/sap/stores/sap-sync-store";
import { cn } from "@/utils/cn";

const formatCount = (value: number) => value.toLocaleString();

/**
 * Friendly wait copy that cycles while totals are still unknown.
 * Kept non-technical for end users watching the sync modal.
 */
const WAITING_MESSAGES = [
  "Counting records in SAP…",
  "Fetching the next batch…",
  "Updating stock records…",
  "Matching locations…",
  "Almost done — hang tight…",
] as const;

/** Soft hints shown under real counts so the wait still feels alive. */
const PROGRESS_HINTS = [
  "Working through your records…",
  "Applying updates as we go…",
  "Keeping stock in sync…",
  "Almost there…",
] as const;

const ROTATE_MS = 3_200;

function progressPercent(progress: SapSyncProgress): number | null {
  if (progress.phase === "success") return 100;
  if (progress.total == null || progress.total <= 0) return null;
  return Math.max(0, Math.min(100, (progress.processed / progress.total) * 100));
}

function countDetail(progress: SapSyncProgress): string | null {
  const total = progress.total;
  if (total == null || total <= 0) {
    if (progress.processed > 0) {
      return `${formatCount(progress.processed)} processed so far`;
    }
    return null;
  }
  const remaining = Math.max(0, total - progress.processed);
  return `${formatCount(progress.processed)} processed · ${formatCount(remaining)} remaining`;
}

function settledDetail(progress: SapSyncProgress): string {
  if (progress.phase === "success" || progress.phase === "warning") {
    return progress.summary ?? "";
  }
  if (progress.phase === "error") {
    return progress.errorMessage ?? progress.summary ?? "";
  }
  return "";
}

function useRotatingMessage(messages: readonly string[], active: boolean): string {
  const [index, setIndex] = useState(0);
  const [wasActive, setWasActive] = useState(active);

  // Reset during render when the rotator stops, so the next pass starts at the
  // first line. Doing this in an effect retriggers a render in the same turn.
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) setIndex(0);
  }

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % messages.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [active, messages.length]);

  return messages[index] ?? messages[0] ?? "";
}

function PhaseIcon({ phase }: { phase: SapSyncProgressPhase }) {
  switch (phase) {
    case "running":
      return (
        <div className="relative mb-6 flex size-14 items-center justify-center">
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-primary/15"
          />
          <span
            aria-hidden
            className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary border-r-primary/40"
          />
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      );
    case "success":
      return (
        <div className="mb-6 flex size-14 items-center justify-center rounded-full bg-emerald-600/10">
          <CheckCircle2 className="size-8 text-emerald-600" />
        </div>
      );
    case "warning":
      return (
        <div className="mb-6 flex size-14 items-center justify-center rounded-full bg-amber-500/10">
          <CheckCircle2 className="size-8 text-amber-600" />
        </div>
      );
    case "error":
      return (
        <div className="mb-6 flex size-14 items-center justify-center rounded-full bg-destructive/10">
          <XCircle className="size-8 text-destructive" />
        </div>
      );
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

function SyncStatusLines({ progress }: { progress: SapSyncProgress }) {
  const isRunning = progress.phase === "running";
  const counts = isRunning ? countDetail(progress) : null;
  const waiting = useRotatingMessage(WAITING_MESSAGES, isRunning && counts == null);
  const hint = useRotatingMessage(PROGRESS_HINTS, isRunning && counts != null);
  const settled = !isRunning ? settledDetail(progress) : "";

  if (!isRunning) {
    if (!settled) return null;
    return (
      <p
        className={cn(
          "mt-4 text-sm font-medium tabular-nums",
          progress.phase === "error" ? "text-destructive" : "text-foreground",
        )}
      >
        {settled}
      </p>
    );
  }

  if (counts) {
    return (
      <div className="mt-4 space-y-1">
        <p className="text-sm font-medium tabular-nums text-foreground">{counts}</p>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {hint}
        </p>
      </div>
    );
  }

  return (
    <p className="mt-4 text-sm font-medium text-foreground" aria-live="polite">
      {waiting}
    </p>
  );
}

function SyncProgressCard({
  syncKey,
  progress,
}: {
  syncKey: string;
  progress: SapSyncProgress;
}) {
  const requestStop = useSapSyncStore((s) => s.requestStop);
  const setProgress = useSapSyncStore((s) => s.setProgress);
  const stopRequested = useSapSyncStore((s) => s.stopRequested[syncKey] === true);

  const percent = progressPercent(progress);
  const isRunning = progress.phase === "running";
  const canDismiss =
    progress.phase === "success" ||
    progress.phase === "error" ||
    progress.phase === "warning";

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen && canDismiss) setProgress(syncKey, null);
      }}
    >
      <DialogContent
        showCloseButton={canDismiss}
        className={cn(
          "z-100 max-w-sm gap-0 p-0 sm:rounded-xl",
          !canDismiss && "[&>button]:hidden",
        )}
        overlayClassName="z-[100]"
        onEscapeKeyDown={(event) => {
          if (!canDismiss) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (!canDismiss) event.preventDefault();
        }}
      >
        <div className="flex flex-col items-center px-8 pb-8 pt-10 text-center">
          <PhaseIcon phase={progress.phase} />
          <DialogHeader className="space-y-2 text-center sm:text-center">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              {progress.title}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              {isRunning
                ? progress.description
                : progress.phase === "error"
                  ? "The sync stopped before it finished."
                  : progress.phase === "warning"
                    ? "Nothing from this pass could be applied."
                    : "Sync finished successfully."}
            </DialogDescription>
          </DialogHeader>

          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            aria-label="SAP sync progress"
            className="mt-6 h-1 w-full overflow-hidden rounded-full bg-primary/15"
          >
            {percent != null ? (
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500 ease-out",
                  progress.phase === "error"
                    ? "bg-destructive"
                    : progress.phase === "warning"
                      ? "bg-amber-500"
                      : "bg-primary",
                )}
                style={{
                  width: `${Math.max(percent, percent > 0 ? 2 : 0)}%`,
                }}
              />
            ) : (
              <div className="h-full w-1/3 animate-[loading-bar_1.35s_ease-in-out_infinite] rounded-full bg-primary" />
            )}
          </div>

          <SyncStatusLines progress={progress} />

          {isRunning ? (
            <div className="mt-5 w-full">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={stopRequested}
                onClick={() => requestStop(syncKey)}
              >
                {stopRequested ? "Stopping after this batch…" : "Stop"}
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mounted once at the app shell. Shows the planogram-style progress modal for every
 * in-flight SAP sync, with live processed / remaining counts from each settled slice.
 */
export function SapSyncProgressModals() {
  const progress = useSapSyncStore((s) => s.progress);
  const entries = Object.entries(progress);
  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(([key, state]) => (
        <SyncProgressCard key={key} syncKey={key} progress={state} />
      ))}
    </>
  );
}
