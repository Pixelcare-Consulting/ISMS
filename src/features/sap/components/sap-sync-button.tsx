"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  runSapSync,
  useSapSyncPending,
  type SapSyncNoun,
  type SapSyncResponse,
} from "@/features/sap/hooks/use-sap-sync";
import { useSapSyncStore } from "@/features/sap/stores/sap-sync-store";

export type { SapSyncNoun, SapSyncResponse };

interface SapSyncButtonProps {
  /**
   * Unique key for this sync across the whole app, e.g. `"branch"`, `"warehouse"`,
   * `"inventory:FWH01SKD"`. Drives the toast id, the pending badge, and which report
   * dialog (rendered globally by `SapSyncReportDialogs`) belongs to this button.
   */
  syncKey: string;
  /** Singular + plural noun for the record type, e.g. `{ one: "branch", many: "branches" }`. */
  noun: SapSyncNoun;
  onSync: () => Promise<SapSyncResponse>;
}

/**
 * Shared "Sync from SAP" control for the one-way SAP → ISMS master-data syncs.
 * The sync itself runs via `runSapSync`, outside this component's lifecycle, so leaving
 * the page (or starting another module's sync at the same time) doesn't interrupt it —
 * this button only reflects state for its own `syncKey` and refreshes this page's data
 * once that key's sync completes, if still mounted.
 */
export function SapSyncButton({ syncKey, noun, onSync }: SapSyncButtonProps) {
  const router = useRouter();
  const pending = useSapSyncPending(syncKey);
  const completedAt = useSapSyncStore((s) => s.completedAt[syncKey]);
  const seenCompletedAt = useRef(completedAt);

  useEffect(() => {
    if (completedAt !== undefined && completedAt !== seenCompletedAt.current) {
      seenCompletedAt.current = completedAt;
      router.refresh();
    }
  }, [completedAt, router]);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => runSapSync(syncKey, noun, onSync)}
    >
      <RefreshCw className={`mr-1 size-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Syncing…" : "Sync from SAP"}
    </Button>
  );
}
