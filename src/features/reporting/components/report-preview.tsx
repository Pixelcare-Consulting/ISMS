"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loadDatasetsAction } from "@/features/reporting/actions/reporting.actions";
import { ReportingLoading } from "@/features/reporting/components/reporting-loading";
import { StimulsoftViewer } from "@/features/reporting/components/stimulsoft-viewer";
import type { DatasetKey, DatasetRow } from "@/features/reporting/datasets/dataset-catalog";
import { createReportFromTemplate, setReportVariable } from "@/features/reporting/lib/create-report";
import { preloadStimulsoftViewer, type StimulsoftApi } from "@/features/reporting/lib/stimulsoft-client";
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
  /** Closes the modal; callers reset `params` to null. */
  onClose: () => void;
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

/** Modal with on-screen preview, print and PDF/Excel export for one report definition. */
export function ReportPreview({ reportKey, params, filterSummary, onClose }: ReportPreviewProps) {
  // Outcome is tagged with the params it answers; anything else is still loading.
  const [loaded, setLoaded] = useState<{ params: DatasetParams; outcome: PreviewOutcome } | null>(null);
  const state: PreviewState = !params
    ? { status: "IDLE" }
    : loaded?.params === params
      ? loaded.outcome
      : { status: "LOADING" };

  useEffect(() => preloadStimulsoftViewer(), []);

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

  const title = REPORT_DEFINITIONS[reportKey].title;

  return (
    <Dialog open={state.status !== "IDLE"} onOpenChange={(open) => !open && onClose()}>
      {/* Pinned by insets, not a calc() height: Safari collapsed the dialog to its header. */}
      <DialogContent className="inset-2 flex w-auto max-w-none max-h-none translate-x-0 translate-y-0 flex-col gap-3 overflow-hidden p-3 sm:inset-4 sm:p-4 lg:inset-x-8">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{filterSummary}</DialogDescription>
        </DialogHeader>

        {ready?.truncated ? (
          <p className="text-sm text-muted-foreground">
            Showing the first rows only. Narrow the date range to see everything, or use the export.
          </p>
        ) : null}

        <div className="relative min-h-0 flex-1">
          {state.status === "LOADING" ? (
            <ReportingLoading label="Loading report data" className="absolute inset-0 rounded-xl border bg-card" />
          ) : null}

          {state.status === "ERROR" ? (
            <p
              role="alert"
              className="absolute inset-0 flex items-center justify-center rounded-xl border border-destructive/40 bg-card p-4 text-center text-sm text-destructive"
            >
              {state.message}
            </p>
          ) : null}

          {ready && ready.rowCount === 0 ? (
            <p className="absolute inset-0 flex items-center justify-center rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
              No rows match these filters.
            </p>
          ) : null}

          {ready && ready.rowCount > 0 ? (
            <StimulsoftViewer variant="REPORT" createReport={createReport} frameClassName="absolute inset-0" />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
