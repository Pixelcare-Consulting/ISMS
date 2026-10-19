"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { defaultDashboardRange } from "@/features/custom-dashboards/lib/default-range";
import { loadDatasetsAction } from "@/features/reporting/actions/reporting.actions";
import { StimulsoftViewer } from "@/features/reporting/components/stimulsoft-viewer";
import { DATASET_CATALOG, type DatasetKey, type DatasetRow } from "@/features/reporting/datasets/dataset-catalog";
import { registerDatasets, templateDatasetKeys } from "@/features/reporting/lib/create-report";
import type { StimulsoftApi } from "@/features/reporting/lib/stimulsoft-client";

interface CustomDashboardViewerProps {
  template: Record<string, unknown>;
}

type Range = { from: string; to: string };

type LoadOutcome =
  | { status: "ERROR"; message: string }
  | { status: "READY"; rows: Partial<Record<DatasetKey, DatasetRow[]>>; denied: DatasetKey[]; truncated: boolean };

/** Renders a saved layout with data loaded under the viewer's own access. */
export function CustomDashboardViewer({ template }: CustomDashboardViewerProps) {
  const keys = useMemo(() => templateDatasetKeys(template), [template]);
  const [draft, setDraft] = useState<Range>(() => defaultDashboardRange());
  const [range, setRange] = useState<Range>(draft);
  const [loaded, setLoaded] = useState<{ range: Range; outcome: LoadOutcome } | null>(null);
  const outcome = loaded?.range === range ? loaded.outcome : null;

  useEffect(() => {
    if (keys.length === 0) return;
    let cancelled = false;
    const settle = (next: LoadOutcome) => {
      if (!cancelled) setLoaded({ range, outcome: next });
    };

    loadDatasetsAction({ keys, params: range, skipDenied: true })
      .then((result) => {
        if (!result.success) {
          settle({ status: "ERROR", message: result.error });
          return;
        }
        const rows: Partial<Record<DatasetKey, DatasetRow[]>> = {};
        let truncated = false;
        for (const [key, data] of Object.entries(result.datasets)) {
          if (!data) continue;
          rows[key as DatasetKey] = data.rows;
          truncated ||= data.truncated;
        }
        // Denied datasets still bind (empty) so their elements render blank, not broken.
        for (const key of result.denied) rows[key] = [];
        settle({ status: "READY", rows, denied: result.denied, truncated });
      })
      .catch((error: unknown) => {
        console.error("[custom-dashboards] load failed", error);
        settle({ status: "ERROR", message: "Could not load the dashboard data. Try again." });
      });

    return () => {
      cancelled = true;
    };
  }, [keys, range]);

  const ready = outcome?.status === "READY" ? outcome : null;
  const createReport = useCallback(
    (api: StimulsoftApi) => {
      const report = new api.Report.StiReport();
      report.load(template);
      if (ready) registerDatasets(api, report, ready.rows);
      return report;
    },
    [template, ready],
  );

  if (keys.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        This dashboard has no data yet. Its owner can add datasets in the designer.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setRange({ ...draft });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="custom-dashboard-from">From</Label>
          <Input
            id="custom-dashboard-from"
            type="date"
            value={draft.from}
            max={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="custom-dashboard-to">To</Label>
          <Input
            id="custom-dashboard-to"
            type="date"
            value={draft.to}
            min={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            required
          />
        </div>
        <Button type="submit" variant="outline">
          Apply dates
        </Button>
      </form>

      {!outcome ? (
        <div className="flex min-h-60 items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground">
          <LoadingIndicator label="Loading dashboard data" />
        </div>
      ) : null}

      {outcome?.status === "ERROR" ? (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-card p-4 text-sm text-destructive">
          {outcome.message}
        </p>
      ) : null}

      {ready ? (
        <>
          {ready.denied.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Some elements are empty because your role can&apos;t open:{" "}
              {ready.denied.map((key) => DATASET_CATALOG[key].label).join(", ")}.
            </p>
          ) : null}
          {ready.truncated ? (
            <p className="text-sm text-muted-foreground">Some datasets hit the row limit. Narrow the dates to see everything.</p>
          ) : null}
          <StimulsoftViewer
            variant="DASHBOARD"
            frameClassName="h-[calc(100dvh-16rem)] min-h-[560px]"
            createReport={createReport}
          />
        </>
      ) : null}
    </div>
  );
}
