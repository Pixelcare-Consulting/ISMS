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

/**
 * Ceiling on how long the client waits for a slice before it stops believing in it.
 *
 * A server action can fail to settle at all — navigating away mid-flight drops the
 * request, and the promise then neither resolves nor rejects. Without a ceiling that
 * wedges the sync permanently: `finish` never runs, so `pending` stays true, the loading
 * toast spins forever, and every later click is swallowed by the duplicate-run guard
 * below. Only a full page load clears it, because the store is module state.
 *
 * Comfortably above the longest slice a button asks for (45s for serials) and above the
 * route's own 240s budget, so this only ever fires for a request that is genuinely never
 * coming back.
 */
const SLICE_TIMEOUT_MS = 300_000;

/**
 * Settle `promise` no later than `ms`, so a caller's cleanup always runs.
 *
 * The work is not cancelled — a server action goes on writing whatever it was writing,
 * and its cursor keeps its place. This only frees the UI from waiting on an answer that
 * is not arriving.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          "The sync did not respond in time. It may still be running on the server — " +
            "reload the page to see where it got to before starting another.",
        ),
      );
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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

interface SyncToastButton {
  label: string;
  onClick: () => void;
}

interface SyncToastOptions {
  description?: string;
  duration?: number;
  action?: SyncToastButton;
  cancel?: SyncToastButton;
}

/**
 * Show this sync key's one toast, replacing whatever it said before.
 *
 * Every field is passed on every call, including the ones being cleared. Reusing a toast
 * id updates that toast in place and merges only the fields handed over, so anything
 * omitted silently keeps its previous value: a fresh spinner would otherwise appear over
 * the last run's error text, still carrying its "Continue" button, and — because a
 * loading toast does not expire — sit there saying it forever.
 */
function showSyncToast(
  kind: "loading" | "success" | "info" | "warning" | "error",
  key: string,
  title: string,
  options: SyncToastOptions = {},
) {
  toast[kind](title, {
    id: key,
    description: options.description,
    duration: options.duration,
    action: options.action,
    cancel: options.cancel,
  });
}

function reportError(key: string, noun: SapSyncNoun, description?: string | null) {
  showSyncToast("error", key, `Could not sync ${noun.many} from SAP`, {
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
  /**
   * Refresh the page's data. Called the moment the slice settles — in the same tick as
   * the toast, not on a later render — so the table shows the rows the toast is talking
   * about. Runs even when the sync failed: a slice that died partway may still have
   * written pages before it did.
   */
  onFinished?: () => void,
): void {
  const store = useSapSyncStore.getState();

  // Ignore duplicate triggers (a second tab, a double click) while a run is genuinely in
  // flight — but never permanently. A run recorded longer ago than a slice can possibly
  // take is not running any more, whatever happened to it, and must not lock the button
  // out of ever trying again.
  const startedAt = store.pending[key];
  if (startedAt !== undefined && Date.now() - startedAt < SLICE_TIMEOUT_MS) return;

  store.start(key);
  store.setReport(key, null);
  showSyncToast("loading", key, `Syncing ${noun.many} from SAP…`);

  withTimeout(action(), SLICE_TIMEOUT_MS)
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
          showSyncToast("warning", key, `No ${noun.many} could be applied`, {
            duration: WARNING_TOAST_MS,
            description: `${summarize(result)}. ${reason ?? ""}`.trim(),
          });
        } else {
          showSyncToast("success", key, `${noun.many} are up to date with SAP`, {
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

        showSyncToast(nothingApplied ? "warning" : "info", key, title, {
          duration: DECISION_TOAST_MS,
          description: detail,
          action: {
            label: "Continue",
            onClick: () => runSapSync(key, noun, action, onFinished),
          },
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
      onFinished?.();
    });
}

/**
 * Subscribe a component to whether a given sync key is currently running.
 *
 * A run older than the slice ceiling reads as not running: it is one that never reported
 * back, and leaving its button disabled forever helps nobody. The button re-enables on
 * the next render after that point rather than the exact instant — close enough for a
 * case that only happens when a request has already been lost.
 */
export function useSapSyncPending(key: string): boolean {
  return useSapSyncStore((s) => {
    const startedAt = s.pending[key];
    return startedAt !== undefined && Date.now() - startedAt < SLICE_TIMEOUT_MS;
  });
}
