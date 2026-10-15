"use client";

import { toast } from "sonner";

import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import {
  useSapSyncStore,
  type SapSyncNoun,
  type SapSyncProgress,
} from "@/features/sap/stores/sap-sync-store";

export type { SapSyncNoun };
export type SapSyncResponse = { error: string } | { success: true; result: SapSyncResult };

const formatCount = (value: number) => value.toLocaleString();

/** How long the success toast stays readable after the modal closes. */
const SUCCESS_TOAST_MS = 8_000;

/** Long enough to read a multi-line reason, without lingering. */
const WARNING_TOAST_MS = 15_000;

/** Brief pause so the modal can show a completed/failed state before clearing. */
const MODAL_SETTLE_MS = 1_200;

/**
 * Ceiling on how long the client waits for a slice before it stops believing in it.
 *
 * A server action can fail to settle at all — navigating away mid-flight drops the
 * request, and the promise then neither resolves nor rejects. Without a ceiling that
 * wedges the sync permanently: `finish` never runs, so `pending` stays true, the loading
 * modal spins forever, and every later click is swallowed by the duplicate-run guard
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
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
  if (result.removed > 0) parts.push(`${formatCount(result.removed)} removed`);
  const skipped = skippedCount(result);
  if (skipped > 0) parts.push(`${formatCount(skipped)} skipped`);
  const summary = parts.join(" · ");
  return result.notes?.length ? [summary, ...result.notes].join(". ") : summary;
}

/** The reason behind the most rows, to lead with when nothing could be applied. */
function dominantSkipReason(result: SapSyncResult): string | null {
  const worst = [...result.skipped].sort((a, b) => b.count - a.count)[0];
  return worst?.reason ?? null;
}

function progressDetail(processed: number, total: number | null): string {
  if (total == null || total <= 0) {
    return processed > 0
      ? `${formatCount(processed)} processed so far`
      : "Counting records in SAP…";
  }
  const remaining = Math.max(0, total - processed);
  return `${formatCount(processed)} processed · ${formatCount(remaining)} remaining`;
}

function runningProgress(
  noun: SapSyncNoun,
  processed: number,
  total: number | null,
): SapSyncProgress {
  return {
    noun,
    phase: "running",
    title: `Syncing ${noun.many} from SAP`,
    description: "Please wait while we sync records from SAP.",
    processed,
    total,
    summary: progressDetail(processed, total),
  };
}

function showResultToast(
  kind: "success" | "info" | "warning" | "error",
  key: string,
  title: string,
  options: { description?: string; duration?: number } = {},
) {
  toast[kind](title, {
    id: key,
    description: options.description,
    duration: options.duration,
  });
}

function reportError(key: string, noun: SapSyncNoun, description?: string | null) {
  showResultToast("error", key, `Could not sync ${noun.many} from SAP`, {
    description: description ?? undefined,
  });
}

/**
 * Run a SAP sync outside any component's lifecycle: the promise chain, and the progress
 * modal it drives, live on the store rather than on a mounted component, so navigating
 * away from the page that started it neither cancels the sync nor loses the result.
 *
 * Handles both sizes of entity through one path. A small entity comes back `caughtUp` and
 * reports as done. A large one returns with its place saved; the client auto-continues
 * the next slice while the modal stays open, updating processed / remaining after each
 * batch. Stop ends the chain after the current slice and leaves the rest to the scheduled
 * job.
 */
export function runSapSync(
  key: string,
  noun: SapSyncNoun,
  action: () => Promise<SapSyncResponse>,
  /**
   * Refresh the page's data. Called after each settled slice — in the same tick as the
   * progress update — so the table shows the rows the modal is talking about. Runs even
   * when the sync failed: a slice that died partway may still have written pages before
   * it did.
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
  store.clearStop(key);
  store.setReport(key, null);
  store.setProgress(key, runningProgress(noun, 0, null));

  void (async () => {
    let lastProcessed = 0;
    let lastTotal: number | null = null;

    try {
      while (true) {
        if (useSapSyncStore.getState().stopRequested[key]) {
          useSapSyncStore.getState().setProgress(key, null);
          showResultToast("info", key, `Stopped syncing ${noun.many}`, {
            description:
              lastProcessed > 0
                ? `${progressDetail(lastProcessed, lastTotal)}. The scheduled sync will continue later.`
                : "The scheduled sync will continue later.",
          });
          break;
        }

        const response = await withTimeout(action(), SLICE_TIMEOUT_MS);

        if ("error" in response) {
          useSapSyncStore.getState().setProgress(key, {
            noun,
            phase: "error",
            title: `Could not sync ${noun.many}`,
            description: "Something went wrong while syncing from SAP.",
            processed: lastProcessed,
            total: lastTotal,
            errorMessage: response.error,
            summary: progressDetail(lastProcessed, lastTotal),
          });
          reportError(key, noun, response.error);
          await delay(MODAL_SETTLE_MS);
          useSapSyncStore.getState().setProgress(key, null);
          break;
        }

        const result = response.result;
        lastProcessed = result.passRows;
        lastTotal = result.totalAtSource;

        const nothingApplied = appliedCount(result) === 0 && skippedCount(result) > 0;
        const reason = dominantSkipReason(result);

        useSapSyncStore
          .getState()
          .setProgress(key, runningProgress(noun, lastProcessed, lastTotal));

        useSapSyncStore
          .getState()
          .setReport(key, result.skipped.length > 0 ? { noun, result } : null);

        onFinished?.();

        if (!result.caughtUp) {
          // Auto-continue the next slice; Stop is checked at the top of the loop.
          continue;
        }

        if (nothingApplied) {
          const warningSummary = `${summarize(result)}. ${reason ?? ""}`.trim();
          useSapSyncStore.getState().setProgress(key, {
            noun,
            phase: "warning",
            title: `No ${noun.many} could be applied`,
            description: "Please wait while we sync records from SAP.",
            processed: lastProcessed,
            total: lastTotal,
            summary: warningSummary,
          });
          showResultToast("warning", key, `No ${noun.many} could be applied`, {
            duration: WARNING_TOAST_MS,
            description: warningSummary,
          });
        } else {
          const successSummary = summarize(result);
          useSapSyncStore.getState().setProgress(key, {
            noun,
            phase: "success",
            title: `${noun.many} are up to date with SAP`,
            description: "Please wait while we sync records from SAP.",
            processed: lastProcessed,
            total: lastTotal ?? lastProcessed,
            summary: successSummary,
          });
          showResultToast("success", key, `${noun.many} are up to date with SAP`, {
            duration: SUCCESS_TOAST_MS,
            description: successSummary,
          });
        }

        await delay(MODAL_SETTLE_MS);
        useSapSyncStore.getState().setProgress(key, null);
        break;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unexpected error";
      useSapSyncStore.getState().setProgress(key, {
        noun,
        phase: "error",
        title: `Could not sync ${noun.many}`,
        description: "Something went wrong while syncing from SAP.",
        processed: lastProcessed,
        total: lastTotal,
        errorMessage: message,
        summary: progressDetail(lastProcessed, lastTotal),
      });
      reportError(key, noun, message);
      await delay(MODAL_SETTLE_MS);
      useSapSyncStore.getState().setProgress(key, null);
    } finally {
      useSapSyncStore.getState().finish(key);
      useSapSyncStore.getState().clearStop(key);
      onFinished?.();
    }
  })();
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
