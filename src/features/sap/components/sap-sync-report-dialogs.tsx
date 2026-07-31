"use client";

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
import type { SapMasterSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { useSapSyncStore, type SapSyncReport } from "@/features/sap/stores/sap-sync-store";

function summarize(result: SapMasterSyncResult): string {
  return `${result.created} added · ${result.updated} updated · ${result.unchanged} unchanged`;
}

function ReportDialog({ syncKey, report }: { syncKey: string; report: SapSyncReport }) {
  const setReport = useSapSyncStore((s) => s.setReport);
  const { noun, result } = report;
  const close = () => setReport(syncKey, null);

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>SAP {noun.many} that were not applied</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {summarize(result)}. The rows below were left untouched.
            {result.notInSap > 0
              ? ` ${result.notInSap} ISMS ${result.notInSap === 1 ? `${noun.one} has` : `${noun.many} have`} no matching SAP record — nothing was deleted or deactivated.`
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
                {result.skipped.map((skip, index) => (
                  <TableRow key={`${skip.sapCode ?? "unknown"}-${index}`}>
                    <TableCell className="font-mono text-xs">{skip.sapCode ?? "—"}</TableCell>
                    <TableCell>{skip.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{skip.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={close}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mounted once at the app shell (see `(app)/layout.tsx`). Renders the skipped-row report
 * for every SAP sync key that has one, regardless of which page — or whether any page at
 * all — started that sync. Without this living outside individual module pages, a report
 * from a sync started on Branches would disappear if the user navigated to Warehouses
 * before it finished.
 */
export function SapSyncReportDialogs() {
  const reports = useSapSyncStore((s) => s.reports);
  return (
    <>
      {Object.entries(reports).map(([key, report]) => (
        <ReportDialog key={key} syncKey={key} report={report} />
      ))}
    </>
  );
}
