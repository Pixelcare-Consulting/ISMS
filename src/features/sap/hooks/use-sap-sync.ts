"use client";

import { toast } from "sonner";

import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { useSapSyncStore, type SapSyncNoun } from "@/features/sap/stores/sap-sync-store";

export type { SapSyncNoun };
export type SapSyncResponse = { error: string } | { success: true; result: SapSyncResult };

const formatCount = (value: number) => value.toLocaleString();

function summarize(result: SapSyncResult): string {
  return (
    `${formatCount(result.created)} added · ${formatCount(result.updated)} updated · ` +
    `${formatCount(result.unchanged)} unchanged`
  );
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

      if (result.caughtUp) {
        toast.success(`${noun.many} are up to date with SAP`, {
          id: key,
          description: summarize(result),
        });
      } else {
        toast.info(`Batch done — ${progressLine(result)}`, {
          id: key,
          // Stays until answered: this is a question, not a notification.
          duration: Infinity,
          description: `${summarize(result)}. There are more ${noun.many} in SAP.`,
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
