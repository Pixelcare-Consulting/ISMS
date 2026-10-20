"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DashboardPeriodSelect,
  type DashboardPeriodChoice,
} from "@/features/custom-dashboards/components/dashboard-period-select";
import { resolveDashboardPeriod, type DashboardRange } from "@/features/custom-dashboards/lib/dashboard-period";
import {
  DEFAULT_CUSTOM_DASHBOARD_PERIOD,
  type CustomDashboardPeriod,
} from "@/features/custom-dashboards/schemas/custom-dashboard.schema";
import { loadDatasetsAction } from "@/features/reporting/actions/reporting.actions";
import { ReportingLoading } from "@/features/reporting/components/reporting-loading";
import { StimulsoftViewer } from "@/features/reporting/components/stimulsoft-viewer";
import { DATASET_CATALOG, type DatasetKey, type DatasetRow } from "@/features/reporting/datasets/dataset-catalog";
import { registerDatasets, templateDatasetKeys } from "@/features/reporting/lib/create-report";
import { describeDateRange } from "@/features/reporting/lib/filter-summary";
import { applyIsmsDashboardTheme } from "@/features/reporting/lib/reporting-theme";
import type { StimulsoftApi } from "@/features/reporting/lib/stimulsoft-client";
import { useJsonStable } from "@/hooks/use-json-stable";

interface CustomDashboardViewerProps {
  template: Record<string, unknown>;
  /** The owner's saved period; the viewer can switch for this session only. */
  defaultPeriod?: CustomDashboardPeriod;
}

type Range = DashboardRange;

/** Viewer toolbar height, in layout units, added to the frame's aspect ratio. */
const TOOLBAR_ALLOWANCE = 48;

/**
 * Stimulsoft scales a dashboard to fit its frame, so the frame takes the
 * dashboard's own aspect ratio (desktop size, and the mobile layout size when
 * one was designed). Defaults match Stimulsoft's new-dashboard canvas.
 */
function templateCanvas(template: Record<string, unknown>) {
  const page = (template.Pages as Record<string, { Width?: number; Height?: number; AltSize?: string }> | undefined)?.["0"];
  const width = Number(page?.Width) || 1200;
  const height = Number(page?.Height) || 600;
  const [altWidth, altHeight] = String(page?.AltSize ?? "").split(",").map(Number);
  const mobile = altWidth > 0 && altHeight > 0 ? { width: altWidth, height: altHeight } : { width, height };
  return {
    desktopRatio: `${width} / ${height + TOOLBAR_ALLOWANCE}`,
    mobileRatio: `${mobile.width} / ${mobile.height + TOOLBAR_ALLOWANCE}`,
  };
}

type LoadOutcome =
  | { status: "ERROR"; message: string }
  | { status: "READY"; rows: Partial<Record<DatasetKey, DatasetRow[]>>; denied: DatasetKey[]; truncated: boolean };

/** Renders a saved layout with data loaded under the viewer's own access. */
export function CustomDashboardViewer(props: CustomDashboardViewerProps) {
  // Router refreshes re-send the template; keep it stable so data isn't reloaded.
  const template = useJsonStable(props.template);
  const keys = useMemo(() => templateDatasetKeys(template), [template]);
  const hasDatedData = keys.some((key) => DATASET_CATALOG[key].dashboardDateRange);
  const canvas = useMemo(() => templateCanvas(template), [template]);
  const initialPeriod = props.defaultPeriod ?? DEFAULT_CUSTOM_DASHBOARD_PERIOD;
  const [period, setPeriod] = useState<DashboardPeriodChoice>(initialPeriod);
  const [draft, setDraft] = useState<Range>(() => resolveDashboardPeriod(initialPeriod));
  const [range, setRange] = useState<Range>(draft);
  const [loaded, setLoaded] = useState<{ range: Range; outcome: LoadOutcome } | null>(null);
  const outcome = loaded?.range === range ? loaded.outcome : null;

  useEffect(() => {
    if (keys.length === 0) return;
    let cancelled = false;
    const settle = (next: LoadOutcome) => {
      if (!cancelled) setLoaded({ range, outcome: next });
    };

    // The date range only applies to period datasets; point-in-time ones load as of now.
    const dated = keys.filter((key) => DATASET_CATALOG[key].dashboardDateRange);
    const current = keys.filter((key) => !DATASET_CATALOG[key].dashboardDateRange);
    Promise.all([
      dated.length > 0 ? loadDatasetsAction({ keys: dated, params: range, skipDenied: true }) : null,
      current.length > 0 ? loadDatasetsAction({ keys: current, skipDenied: true }) : null,
    ])
      .then((results) => {
        const rows: Partial<Record<DatasetKey, DatasetRow[]>> = {};
        const denied: DatasetKey[] = [];
        let truncated = false;
        for (const result of results) {
          if (!result) continue;
          if (!result.success) {
            settle({ status: "ERROR", message: result.error });
            return;
          }
          for (const [key, data] of Object.entries(result.datasets)) {
            if (!data) continue;
            rows[key as DatasetKey] = data.rows;
            truncated ||= data.truncated;
          }
          denied.push(...result.denied);
        }
        // Denied datasets still bind (empty) so their elements render blank, not broken.
        for (const key of denied) rows[key] = [];
        settle({ status: "READY", rows, denied, truncated });
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
      applyIsmsDashboardTheme(api, report);
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
      {hasDatedData ? (
        <form
          className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            setRange({ ...draft });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="custom-dashboard-period">Period</Label>
            <DashboardPeriodSelect
              id="custom-dashboard-period"
              value={period}
              allowCustom
              onChange={(next) => {
                setPeriod(next);
                // Custom keeps the current dates as a starting point and waits for Apply.
                if (next === "CUSTOM") return;
                const resolved = resolveDashboardPeriod(next);
                setDraft(resolved);
                setRange(resolved);
              }}
            />
          </div>
          {period === "CUSTOM" ? (
            <>
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
            </>
          ) : (
            <p className="pb-2 text-sm text-muted-foreground">{describeDateRange(range.from, range.to)}</p>
          )}
        </form>
      ) : null}

      {!outcome ? (
        <ReportingLoading label="Loading dashboard data" className="min-h-60 rounded-xl border bg-card" />
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
          <div
            style={
              {
                "--sti-desktop-ratio": canvas.desktopRatio,
                "--sti-mobile-ratio": canvas.mobileRatio,
              } as React.CSSProperties
            }
          >
            <StimulsoftViewer
              variant="DASHBOARD"
              frameClassName="[aspect-ratio:var(--sti-mobile-ratio)] md:[aspect-ratio:var(--sti-desktop-ratio)]"
              createReport={createReport}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
