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
import type {
  SapMasterSyncResult,
  SapMasterSyncSkip,
} from "@/features/sap/schemas/sap-master-sync.schema";
import {
  useSapSyncStore,
  type SapSyncNoun,
  type SapSyncReport,
} from "@/features/sap/stores/sap-sync-store";

function summarize(result: SapMasterSyncResult): string {
  return `${result.created} added · ${result.updated} updated · ${result.unchanged} unchanged`;
}

/**
 * A serial sync can skip tens of thousands of rows for one systemic reason. Rendering
 * them all would lock the browser for a list nobody reads past the top of, so the table
 * is capped and the remainder is counted.
 */
const MAX_SKIP_ROWS = 200;

function SkipTable({ skipped }: { skipped: SapMasterSyncSkip[] }) {
  const shown = skipped.slice(0, MAX_SKIP_ROWS);
  const hidden = skipped.length - shown.length;

  return (
    <div className="space-y-2">
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
            {shown.map((skip, index) => (
              <TableRow key={`${skip.sapCode ?? "unknown"}-${index}`}>
                <TableCell className="font-mono text-xs">{skip.sapCode ?? "—"}</TableCell>
                <TableCell>{skip.name ?? "—"}</TableCell>
                <TableCell className="text-sm">{skip.reason}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {hidden > 0 ? (
        <p className="text-muted-foreground text-xs">
          Showing the first {MAX_SKIP_ROWS} of {skipped.length} — {hidden} more not listed.
        </p>
      ) : null}
    </div>
  );
}

/** Counts per distinct reason, so a systemic skip reads as one line, not 40,000. */
function reasonCounts(skipped: SapMasterSyncSkip[]): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const skip of skipped) counts.set(skip.reason, (counts.get(skip.reason) ?? 0) + 1);
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

function SyncSection({
  title,
  result,
  noun,
}: {
  title: string;
  result: SapMasterSyncResult;
  noun?: SapSyncNoun;
}) {
  const reasons = reasonCounts(result.skipped);

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-muted-foreground text-sm">
          {summarize(result)}. {result.skipped.length} left untouched.
          {noun && result.notInSap > 0
            ? ` ${result.notInSap} ISMS ${result.notInSap === 1 ? `${noun.one} has` : `${noun.many} have`} no matching SAP record — nothing was deleted or deactivated.`
            : ""}
        </p>
      </div>

      {reasons.length > 1 ? (
        <ul className="text-muted-foreground space-y-1 text-sm">
          {reasons.map((entry) => (
            <li key={entry.reason}>
              <span className="text-foreground font-medium">{entry.count}</span> — {entry.reason}
            </li>
          ))}
        </ul>
      ) : null}

      {result.skipped.length > 0 ? <SkipTable skipped={result.skipped} /> : null}
    </section>
  );
}

function ReportDialog({ syncKey, report }: { syncKey: string; report: SapSyncReport }) {
  const setReport = useSapSyncStore((s) => s.setReport);
  const { noun, result } = report;
  const close = () => setReport(syncKey, null);

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>SAP records that were not applied</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <SyncSection
            title={noun.many.charAt(0).toUpperCase() + noun.many.slice(1)}
            result={result}
            noun={noun}
          />

          {(result.stages ?? []).map((stage) =>
            stage.result ? (
              <SyncSection
                key={stage.label}
                title={stage.label.charAt(0).toUpperCase() + stage.label.slice(1)}
                result={stage.result}
              />
            ) : (
              <section key={stage.label} className="space-y-1">
                <h3 className="text-sm font-medium">
                  {stage.label.charAt(0).toUpperCase() + stage.label.slice(1)}
                </h3>
                <p className="text-destructive text-sm">
                  Could not be synced: {stage.error ?? "unknown error"}
                </p>
              </section>
            ),
          )}
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
