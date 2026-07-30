"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { getSapSyncStatusesAction } from "@/features/sap/actions/sap.actions";
import type { SapMasterSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { useSapSyncStore, type SapSyncNoun } from "@/features/sap/stores/sap-sync-store";

export type { SapSyncNoun };
export type SapSyncResponse = { error: string } | { success: true; result: SapMasterSyncResult };

/** How often a mounted button re-checks a sync it didn't itself start (another tab, or
 *  one that was already running when this page loaded). */
const POLL_INTERVAL_MS = 4000;

function summarize(result: SapMasterSyncResult): string {
  return `${result.created} added · ${result.updated} updated · ${result.unchanged} unchanged`;
}

function reportSuccess(key: string, noun: SapSyncNoun, result: SapMasterSyncResult) {
  const label = result.fetched === 1 ? noun.one : noun.many;
  toast.success(`Synced ${result.fetched} ${label} from SAP`, {
    id: key,
    description: summarize(result),
  });
  // Skipped rows need the reason spelled out — a toast line cannot carry them.
  useSapSyncStore.getState().setReport(key, result.skipped.length > 0 ? { noun, result } : null);
}

function reportError(key: string, noun: SapSyncNoun, description?: string | null) {
  toast.error(`Could not sync ${noun.many} from SAP`, {
    id: key,
    description: description ?? undefined,
  });
}

/**
 * Runs a SAP master-data sync action outside of any component's lifecycle: the promise
 * chain (and the toast it drives) lives on the store, not on a mounted component, so
 * navigating away from the page that started it neither cancels the sync nor loses the
 * result. Call this the same way from every module that adds a "Sync from SAP" action.
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
      reportSuccess(key, noun, response.result);
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

/**
 * On mount, checks whether `key`'s sync is already running — started from another tab, or
 * still finishing after this page was refreshed — and if so, polls until it's done so the
 * button reflects reality instead of assuming idle. A sync this same tab starts itself via
 * `runSapSync` already tracks its own completion and never needs this polling path.
 */
export function useSapSyncStatusHydration(key: string, noun: SapSyncNoun): void {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function check() {
      const response = await getSapSyncStatusesAction([key]);
      if (cancelled || !response.success) return;

      const status = response.statuses.find((s) => s.entity === key);
      if (!status || status.status !== "running") {
        // Only act if we're the ones who marked it pending from a previous poll —
        // a locally-started sync manages its own toast/finish via runSapSync.
        if (useSapSyncStore.getState().pending[key]) {
          if (status?.status === "success" && status.result) {
            reportSuccess(key, noun, status.result);
          } else if (status?.status === "error") {
            reportError(key, noun, status.error);
          }
          useSapSyncStore.getState().finish(key);
        }
        return;
      }

      if (!useSapSyncStore.getState().pending[key]) {
        useSapSyncStore.getState().start(key);
        toast.loading(`Syncing ${noun.many} from SAP…`, { id: key });
      }
      timer = setTimeout(check, POLL_INTERVAL_MS);
    }

    check();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- noun is stable per call site
  }, [key]);
}
