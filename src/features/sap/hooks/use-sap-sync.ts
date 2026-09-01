"use client";

import { toast } from "sonner";

import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { useSapSyncStore, type SapSyncNoun } from "@/features/sap/stores/sap-sync-store";

export type { SapSyncNoun };
export type SapSyncResponse = { error: string } | { success: true; result: SapSyncResult };

const formatCount = (value: number) => value.toLocaleString();

/**
 * How long a toast carrying a decision stays up.
 *
 * Long enough to read a progress line and reach for "Continue", short enough that it
 * clears itself when nobody does. It deliberately does not wait forever: an unanswered
 * prompt is an answer — the scheduled job picks the entity up regardless, so nothing is
 * lost by letting it go, and a toast that never leaves has to be dismissed by hand.
 */
const DECISION_TOAST_MS = 30_000;

/** Long enough to read a multi-line reason, without lingering. */
const WARNING_TOAST_MS = 15_000;

/** Rows this run actually placed in ISMS, however it placed them. */
function appliedCount(result: SapSyncResult): number {
  return result.created + result.updated + result.unchanged;
}

function skippedCount(result: SapSyncResult): number {
  return result.skipped.reduce((sum, skip) => sum + skip.count, 0);
}

/**
 * Skipped rows belong in the summary, not only in the report dialog. Without them a run
 * that applied nothing reads as "0 added · 0 updated · 0 unchanged" — which looks like
 * SAP had nothing to say, when in fact every row was rejected for a reason worth acting
 * on.
 */
function summarize(result: SapSyncResult): string {
  const parts = [
    `${formatCount(result.created)} added`,
    `${formatCount(result.updated)} updated`,
    `${formatCount(result.unchanged)} unchanged`,
  ];
  const skipped = skippedCount(result);
  if (skipped > 0) parts.push(`${formatCount(skipped)} skipped`);
  return parts.join(" · ");
}

/** The reason behind the most rows, to lead with when nothing could be applied. */
function dominantSkipReason(result: SapSyncResult): string | null {
  const worst = [...result.skipped].sort((a, b) => b.count - a.count)[0];
  return worst?.reason ?? null;
}

/**
 * Progress through the current pass. Counted in rows read rather than in the cursor's own
 * key, which is a SAP identifier and means nothing as a fraction.
 */
function progressLine(result: SapSyncResult): string {
  const done = formatCount(result.passRows);
  if (!result.totalAtSource) return `${done} read so far`;
  const percent = ((result.passRows / result.totalAtSource) * 100).toFixed(1);
  return `${done} of ${formatCount(result.totalAtSource)} (${percent}%)`;
}

function reportError(key: string, noun: SapSyncNoun, description?: string | null) {
  toast.error(`Could not sync ${noun.many} from SAP`, {
    id: key,
    description: description ?? undefined,
  });
}

/**
 * Run a SAP sync outside any component's lifecycle: the promise chain, and the toast it
 * drives, live on the store rather than on a mounted component, so navigating away from
 * the page that started it neither cancels the sync nor loses the result.
 *
 * Handles both sizes of entity through one path. A small entity comes back `caughtUp` and
 * reports as done. A large one comes back with its place saved and offers to continue —
 * rather than making someone press the button a hundred times, or looping invisibly, the
 * decision to keep going (or stop and leave the rest to the scheduled job) stays with the
 * user.
 */
export function runSapSync(
  key: string,
  noun: SapSyncNoun,
  action: () => Promise<SapSyncResponse>,
): void {
  const store = useSapSyncStore.getState();
  if (store.pending[key]) return; // already running for this key — ignore duplicate triggers

  store.start(key);
  store.setReport(key, null);
  toast.loading(`Syncing ${noun.many} from SAP…`, { id: key });

  action()
    .then((response) => {
      if ("error" in response) {
        reportError(key, noun, response.error);
        return;
      }

      const result = response.result;
      const nothingApplied = appliedCount(result) === 0 && skippedCount(result) > 0;
      const reason = dominantSkipReason(result);

      if (result.caughtUp) {
        // A pass that rejected everything is not an up-to-date pass, however cleanly it
        // finished — say what stopped it rather than reporting a hollow success.
        if (nothingApplied) {
          toast.warning(`No ${noun.many} could be applied`, {
            id: key,
            duration: WARNING_TOAST_MS,
            description: `${summarize(result)}. ${reason ?? ""}`.trim(),
          });
        } else {
          toast.success(`${noun.many} are up to date with SAP`, {
            id: key,
            description: summarize(result),
          });
        }
      } else {
        const title = nothingApplied
          ? `Nothing applied yet — ${progressLine(result)}`
          : `Batch done — ${progressLine(result)}`;
        const detail = nothingApplied
          ? `${summarize(result)}. ${reason ?? ""}`.trim()
          : `${summarize(result)}. There are more ${noun.many} in SAP.`;

        toast[nothingApplied ? "warning" : "info"](title, {
          id: key,
          duration: DECISION_TOAST_MS,
          description: detail,
          action: { label: "Continue", onClick: () => runSapSync(key, noun, action) },
          cancel: { label: "Stop", onClick: () => toast.dismiss(key) },
        });
      }

      // Skipped rows need their reasons spelled out — a toast line cannot carry them.
      useSapSyncStore
        .getState()
        .setReport(key, result.skipped.length > 0 ? { noun, result } : null);
    })
    .catch((e) => {
      reportError(key, noun, e instanceof Error ? e.message : "Unexpected error");
    })
    .finally(() => {
      useSapSyncStore.getState().finish(key);
    });
}

/** Subscribe a component to whether a given sync key is currently running. */
export function useSapSyncPending(key: string): boolean {
  return useSapSyncStore((s) => !!s.pending[key]);
}
