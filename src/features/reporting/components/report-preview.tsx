"use client";

import { useCallback, useEffect, useState } from "react";

import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { loadDatasetsAction } from "@/features/reporting/actions/reporting.actions";
import { StimulsoftViewer } from "@/features/reporting/components/stimulsoft-viewer";
import type { DatasetKey, DatasetRow } from "@/features/reporting/datasets/dataset-catalog";
import { createReportFromTemplate, setReportVariable } from "@/features/reporting/lib/create-report";
import type { StimulsoftApi } from "@/features/reporting/lib/stimulsoft-client";
import {
  REPORT_DEFINITIONS,
  reportDatasetKeys,
  type ReportKey,
} from "@/features/reporting/reports/report-definitions";
import type { DatasetParams } from "@/features/reporting/schemas/dataset-params.schema";
import { REPORT_TEMPLATES } from "@/features/reporting/templates/template-loaders";

interface ReportPreviewProps {
  reportKey: ReportKey;
  /** Null until the user asks for a preview. A new object re-runs the report. */
  params: DatasetParams | null;
  /** Printed in the report header, e.g. "2026-10-01 to 2026-10-19". */
  filterSummary: string;
}

type PreviewOutcome =
  | { status: "ERROR"; message: string }
  | {
      status: "READY";
      template: unknown;
      rows: Partial<Record<DatasetKey, DatasetRow[]>>;
      rowCount: number;
      truncated: boolean;
    };

type PreviewState = { status: "IDLE" } | { status: "LOADING" } | PreviewOutcome;

/** On-screen preview, print and PDF/Excel export for one report definition. */
export function ReportPreview({ reportKey, params, filterSummary }: ReportPreviewProps) {
  // Outcome is tagged with the params it answers; anything else is still loading.
  const [loaded, setLoaded] = useState<{ params: DatasetParams; outcome: PreviewOutcome } | null>(null);
  const state: PreviewState = !params
    ? { status: "IDLE" }
    : loaded?.params === params
      ? loaded.outcome
      : { status: "LOADING" };

  useEffect(() => {
    if (!params) return;
    let cancelled = false;
    const settle = (outcome: PreviewOutcome) => {
      if (!cancelled) setLoaded({ params, outcome });
    };

    void Promise.all([
      REPORT_TEMPLATES[reportKey](),
      loadDatasetsAction({ keys: reportDatasetKeys(reportKey), params }),
    ])
      .then(([templateModule, result]) => {
        if (!result.success) {
          settle({ status: "ERROR", message: result.error });
          return;
        }
        const rows: Partial<Record<DatasetKey, DatasetRow[]>> = {};
        let rowCount = 0;
        let truncated = false;
        for (const [key, loaded] of Object.entries(result.datasets)) {
          if (!loaded) continue;
          rows[key as DatasetKey] = loaded.rows;
          rowCount += loaded.rows.length;
          truncated ||= loaded.truncated;
        }
        settle({ status: "READY", template: templateModule.default, rows, rowCount, truncated });
      })
      .catch((error: unknown) => {
        console.error("[reporting] preview failed", error);
        settle({ status: "ERROR", message: "Could not load the report. Try again." });
      });

    return () => {
      cancelled = true;
    };
  }, [reportKey, params]);

  const ready = state.status === "READY" ? state : null;
  const createReport = useCallback(
    (api: StimulsoftApi) => {
      const report = createReportFromTemplate(api, ready?.template, ready?.rows ?? {});
      setReportVariable(report, "FilterSummary", filterSummary);
      return report;
    },
    [ready, filterSummary],
  );

  if (state.status === "IDLE") return null;

  return (
    <section aria-label={`${REPORT_DEFINITIONS[reportKey].title} preview`} className="space-y-2">
      {state.status === "LOADING" ? (
        <div className="flex min-h-40 items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground">
          <LoadingIndicator label="Loading report data" />
        </div>
      ) : null}

      {state.status === "ERROR" ? (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-card p-4 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      {ready && ready.rowCount === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          No rows match these filters.
        </p>
      ) : null}

      {ready && ready.rowCount > 0 ? (
        <>
          {ready.truncated ? (
            <p className="text-sm text-muted-foreground">
              Showing the first rows only. Narrow the date range to see everything, or use the export.
            </p>
          ) : null}
          <StimulsoftViewer variant="REPORT" createReport={createReport} />
        </>
      ) : null}
    </section>
  );
}
