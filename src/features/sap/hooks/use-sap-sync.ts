"use client";

import { toast } from "sonner";

import type { SapMasterSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { useSapSyncStore, type SapSyncNoun } from "@/features/sap/stores/sap-sync-store";

export type { SapSyncNoun };
export type SapSyncResponse = { error: string } | { success: true; result: SapMasterSyncResult };

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
