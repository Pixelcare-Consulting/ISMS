"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { syncBranchesFromSapAction } from "@/features/branches/actions/branch.actions";
import type { BranchSapSyncResult } from "@/features/branches/schemas/branch-sap-sync.schema";
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

function summarize(result: BranchSapSyncResult): string {
  return [
    `${result.created} added`,
    `${result.updated} updated`,
    `${result.unchanged} unchanged`,
  ].join(" · ");
}

export function SyncBranchesSapButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [skipReport, setSkipReport] = useState<BranchSapSyncResult | null>(null);

  function handleSync() {
    startTransition(async () => {
      const response = await syncBranchesFromSapAction();
      if ("error" in response) {
        toast.error("Could not sync branches from SAP", { description: response.error });
        return;
      }

      const { result } = response;
      toast.success(`Synced ${result.fetched} branch${result.fetched === 1 ? "" : "es"} from SAP`, {
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
                  ? ` ${skipReport.notInSap} ISMS branch${skipReport.notInSap === 1 ? " has" : "es have"} no matching SAP record — nothing was deleted or deactivated.`
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
