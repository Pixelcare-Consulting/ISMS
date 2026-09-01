"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { SerialSyncProgress } from "@/features/serial-numbers/services/serial-number-sap-sync.service";
import { useSapSyncStore } from "@/features/sap/stores/sap-sync-store";

const SYNC_KEY = "serial-number";

export type SerialSyncResponse =
  | { error: string }
  | { success: true; result: SerialSyncProgress };

interface SerialSyncButtonProps {
  onSync: () => Promise<SerialSyncResponse>;
}

const formatCount = (value: number) => value.toLocaleString();

function progressLine(result: SerialSyncProgress): string {
  const done = formatCount(result.cursor);
  if (!result.totalAtSource) return `${done} serials synced so far`;
  const percent = ((result.cursor / result.totalAtSource) * 100).toFixed(1);
  return `${done} of ${formatCount(result.totalAtSource)} (${percent}%)`;
}

/**
 * Warn about the one problem the user can actually fix. A serial cannot be stored
 * without its model, so unlinked serials mean the model catalogue is behind — and
 * re-running serials alone will skip them again.
 */
function warnMissingModels(result: SerialSyncProgress) {
  if (result.missingModels === 0) return;
  const codes = result.missingModelCodes;
  toast.warning(`${formatCount(result.missingModels)} serials could not be linked`, {
    id: `${SYNC_KEY}-missing-models`,
    duration: 15000,
    description:
      `Their item is not in ISMS yet — sync Models from SAP (Settings → Master Data), ` +
      `then run this again.` +
      (codes.length > 0 ? ` Missing: ${codes.slice(0, 8).join(", ")}${codes.length > 8 ? "…" : ""}` : ""),
  });
}

/**
 * Sync control for serial numbers.
 *
 * The entity is millions of rows, so one press cannot finish it: the server returns
 * after a time budget with its place saved. Rather than making the user press the
 * button hundreds of times, each batch reports progress and offers to continue, so the
 * decision to keep going (or stop and leave the rest to the scheduled job) stays with
 * the user instead of a loop they cannot see.
 */
export function SerialSyncButton({ onSync }: SerialSyncButtonProps) {
  const router = useRouter();
  const pending = useSapSyncStore((s) => !!s.pending[SYNC_KEY]);
  // Kept in a ref so an unmount (navigating away mid-sync) cannot leave a running batch
  // writing to a dead component.
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  async function runBatch() {
    const store = useSapSyncStore.getState();
    if (store.pending[SYNC_KEY]) return;
    store.start(SYNC_KEY);
    toast.loading("Syncing serial numbers from SAP…", { id: SYNC_KEY });

    try {
      const response = await onSync();

      if ("error" in response) {
        toast.error("Could not sync serial numbers", {
          id: SYNC_KEY,
          description: response.error,
        });
        return;
      }

      const result = response.result;
      const summary = `${formatCount(result.created)} added · ${formatCount(result.updated)} updated`;

      if (result.caughtUp) {
        toast.success("Serial numbers are up to date with SAP", {
          id: SYNC_KEY,
          description: `${summary} · ${progressLine(result)}`,
        });
      } else {
        toast.info(`Batch done — ${progressLine(result)}`, {
          id: SYNC_KEY,
          // Stays until answered: this is a question, not a notification.
          duration: Infinity,
          description: `${summary}. There are more serials in SAP.`,
          action: { label: "Continue", onClick: () => void runBatch() },
          cancel: { label: "Stop", onClick: () => toast.dismiss(SYNC_KEY) },
        });
      }

      warnMissingModels(result);
      if (mounted.current) router.refresh();
    } catch (e) {
      toast.error("Could not sync serial numbers", {
        id: SYNC_KEY,
        description: e instanceof Error ? e.message : "Unexpected error",
      });
    } finally {
      useSapSyncStore.getState().finish(SYNC_KEY);
    }
  }

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => void runBatch()}>
      <RefreshCw className={`mr-1 size-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Syncing…" : "Sync from SAP"}
    </Button>
  );
}
