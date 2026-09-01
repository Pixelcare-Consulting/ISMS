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
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { useSapSyncStore, type SapSyncReport } from "@/features/sap/stores/sap-sync-store";

const formatCount = (value: number) => value.toLocaleString();

function summarize(result: SapSyncResult): string {
  return (
    `${formatCount(result.created)} added · ${formatCount(result.updated)} updated · ` +
    `${formatCount(result.unchanged)} unchanged`
  );
}

/**
 * Grouped by reason rather than listed per row: these syncs run over entities of any
 * size, and the useful answer to "4,812 serials were skipped" is one line naming the
 * cause, not 4,812 rows saying the same thing. A sample of the codes is enough to go
 * looking with.
 */
function ReportDialog({ syncKey, report }: { syncKey: string; report: SapSyncReport }) {
  const setReport = useSapSyncStore((s) => s.setReport);
  const { noun, result } = report;
  const close = () => setReport(syncKey, null);
  const total = result.skipped.reduce((sum, skip) => sum + skip.count, 0);

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>SAP {noun.many} that were not applied</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {summarize(result)}. {formatCount(total)}{" "}
            {total === 1 ? "row was" : "rows were"} left untouched — nothing was deleted or
            deactivated.
          </p>

          <div className="max-h-72 overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Rows</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Examples</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.skipped.map((skip) => (
                  <TableRow key={skip.reason}>
                    <TableCell className="tabular-nums">{formatCount(skip.count)}</TableCell>
                    <TableCell className="text-sm">{skip.reason}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {skip.examples.length > 0 ? skip.examples.join(", ") : "—"}
                      {skip.count > skip.examples.length && skip.examples.length > 0 ? "…" : ""}
                    </TableCell>
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
