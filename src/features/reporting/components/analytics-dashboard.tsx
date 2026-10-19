"use client";

import { useCallback, useEffect, useState } from "react";

import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { loadDatasetsAction } from "@/features/reporting/actions/reporting.actions";
import { StimulsoftViewer } from "@/features/reporting/components/stimulsoft-viewer";
import {
  ANALYTICS_CANVAS,
  ANALYTICS_SECTIONS,
  layoutAnalytics,
  type Rect,
} from "@/features/reporting/dashboards/analytics-layout";
import type { DatasetKey, DatasetRow } from "@/features/reporting/datasets/dataset-catalog";
import { registerDatasets, type StiReport } from "@/features/reporting/lib/create-report";
import type { StimulsoftApi } from "@/features/reporting/lib/stimulsoft-client";
import { loadAnalyticsTemplate } from "@/features/reporting/templates/template-loaders";
import type { Stimulsoft } from "stimulsoft-dashboards-js-react/stimulsoft.reports";

interface AnalyticsDashboardProps {
  /** Element names the user's role may see (resolved on the server). */
  visibleElements: string[];
}

/** Viewer toolbar height, in layout units, added to the frame's aspect ratio. */
const TOOLBAR_ALLOWANCE = 48;

type LoadState =
  | { status: "LOADING" }
  | { status: "ERROR"; message: string }
  | { status: "READY"; template: unknown; rows: Partial<Record<DatasetKey, DatasetRow[]>>; visible: Set<string> };

/**
 * Removes elements outside the user's role (or whose dataset was denied) and
 * re-flows the rest with the same layout the template was generated from.
 */
function applyVisibility(api: StimulsoftApi, report: StiReport, visible: Set<string>) {
  const dashboard = report.pages.getByIndex(0) as Stimulsoft.Dashboard.Components.StiDashboard;
  // Every component on a dashboard page is an element.
  const elements = () => [...dashboard.components.toList()] as Stimulsoft.Dashboard.Components.StiElement[];
  for (const element of elements()) {
    if (!visible.has(element.name)) dashboard.components.remove(element);
  }
  const { placements, desktopHeight, mobileHeight } = layoutAnalytics((el) => visible.has(el.name));
  const toRect = (r: Rect) => new api.System.Drawing.Rectangle(r.left, r.top, r.width, r.height);
  for (const element of elements()) {
    const placement = placements.get(element.name);
    if (!placement) continue;
    element.clientRectangle = toRect(placement.desktop);
    element.altClientRectangle = toRect(placement.mobile);
  }
  dashboard.height = desktopHeight;
  dashboard.altSize = new api.System.Drawing.Size(dashboard.altSize.width, mobileHeight);
}

export function AnalyticsDashboard({ visibleElements }: AnalyticsDashboardProps) {
  const [state, setState] = useState<LoadState>({ status: "LOADING" });
  const visibleKey = visibleElements.join(",");

  useEffect(() => {
    let cancelled = false;
    const visible = new Set(visibleKey.split(","));
    const keys = [
      ...new Set(
        ANALYTICS_SECTIONS.flatMap((s) => s.elements.filter((e) => visible.has(e.name)).map((e) => e.datasetKey)),
      ),
    ];

    void Promise.all([loadAnalyticsTemplate(), loadDatasetsAction({ keys, skipDenied: true })])
      .then(([templateModule, result]) => {
        if (cancelled) return;
        if (!result.success) {
          setState({ status: "ERROR", message: result.error });
          return;
        }
        const rows: Partial<Record<DatasetKey, DatasetRow[]>> = {};
        for (const [key, loaded] of Object.entries(result.datasets)) {
          if (loaded) rows[key as DatasetKey] = loaded.rows;
        }
        // An element whose dataset was denied server-side is dropped as well.
        const denied = new Set(result.denied);
        for (const section of ANALYTICS_SECTIONS) {
          for (const element of section.elements) if (denied.has(element.datasetKey)) visible.delete(element.name);
        }
        setState({ status: "READY", template: templateModule.default, rows, visible });
      })
      .catch((error: unknown) => {
        console.error("[reporting] analytics failed", error);
        if (!cancelled) setState({ status: "ERROR", message: "Could not load the dashboard. Try again." });
      });

    return () => {
      cancelled = true;
    };
  }, [visibleKey]);

  const ready = state.status === "READY" ? state : null;
  const createReport = useCallback(
    (api: StimulsoftApi) => {
      const report = new api.Report.StiReport();
      report.load(ready?.template as object);
      if (ready) {
        applyVisibility(api, report, ready.visible);
        registerDatasets(api, report, ready.rows);
      }
      return report;
    },
    [ready],
  );

  if (state.status === "LOADING") {
    return (
      <div className="flex min-h-60 items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground">
        <LoadingIndicator label="Loading dashboard data" />
      </div>
    );
  }

  if (state.status === "ERROR") {
    return (
      <p role="alert" className="rounded-xl border border-destructive/40 bg-card p-4 text-sm text-destructive">
        {state.message}
      </p>
    );
  }

  // Stimulsoft scales a dashboard to fit its frame, so the frame keeps the
  // layout's own aspect ratio (desktop vs mobile layout) to avoid shrinking it.
  const { desktopHeight, mobileHeight } = layoutAnalytics((el) => state.visible.has(el.name));
  return (
    <div
      style={
        {
          "--sti-desktop-ratio": `${ANALYTICS_CANVAS.desktopWidth} / ${desktopHeight + TOOLBAR_ALLOWANCE}`,
          "--sti-mobile-ratio": `${ANALYTICS_CANVAS.mobileWidth} / ${mobileHeight + TOOLBAR_ALLOWANCE}`,
        } as React.CSSProperties
      }
    >
      <StimulsoftViewer
        variant="DASHBOARD"
        frameClassName="[aspect-ratio:var(--sti-mobile-ratio)] md:[aspect-ratio:var(--sti-desktop-ratio)]"
        createReport={createReport}
      />
    </div>
  );
}
