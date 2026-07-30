"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import type { SapMasterSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SyncResponse = { error: string } | { success: true; result: SapMasterSyncResult };

interface SapSyncButtonProps {
  /** Singular + plural noun for the record type, e.g. `{ one: "branch", many: "branches" }`. */
  noun: { one: string; many: string };
  onSync: () => Promise<SyncResponse>;
}

function summarize(result: SapMasterSyncResult): string {
  return `${result.created} added · ${result.updated} updated · ${result.unchanged} unchanged`;
}

/** Shared "Sync from SAP" control for the one-way SAP → ISMS master-data syncs. */
export function SapSyncButton({ noun, onSync }: SapSyncButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [skipReport, setSkipReport] = useState<SapMasterSyncResult | null>(null);

  function handleSync() {
    startTransition(async () => {
      const response = await onSync();
      if ("error" in response) {
        toast.error(`Could not sync ${noun.many} from SAP`, { description: response.error });
        return;
      }

      const { result } = response;
      const label = result.fetched === 1 ? noun.one : noun.many;
      toast.success(`Synced ${result.fetched} ${label} from SAP`, {
        description: summarize(result),
      });

      // Skipped rows need the reason spelled out — a toast line cannot carry them.
      if (result.skipped.length > 0) setSkipReport(result);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={pending} onClick={handleSync}>
        <RefreshCw className={`mr-1 size-4 ${pending ? "animate-spin" : ""}`} />
        {pending ? "Syncing…" : "Sync from SAP"}
      </Button>

      <Dialog open={!!skipReport} onOpenChange={() => setSkipReport(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>SAP records that were not applied</DialogTitle>
          </DialogHeader>

          {skipReport ? (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                {summarize(skipReport)}. The rows below were left untouched.
                {skipReport.notInSap > 0
                  ? ` ${skipReport.notInSap} ISMS ${skipReport.notInSap === 1 ? `${noun.one} has` : `${noun.many} have`} no matching SAP record — nothing was deleted or deactivated.`
                  : ""}
              </p>

              <div className="max-h-72 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SAP code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {skipReport.skipped.map((skip, index) => (
                      <TableRow key={`${skip.sapCode ?? "unknown"}-${index}`}>
                        <TableCell className="font-mono text-xs">
                          {skip.sapCode ?? "—"}
                        </TableCell>
                        <TableCell>{skip.name ?? "—"}</TableCell>
                        <TableCell className="text-sm">{skip.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button onClick={() => setSkipReport(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
