"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { saveCustomDashboardTemplateAction } from "@/features/custom-dashboards/actions/custom-dashboard.actions";
import { defaultDashboardRange } from "@/features/custom-dashboards/lib/default-range";
import { loadDatasetsAction } from "@/features/reporting/actions/reporting.actions";
import { ReportingLoading } from "@/features/reporting/components/reporting-loading";
import type { DatasetKey, DatasetRow } from "@/features/reporting/datasets/dataset-catalog";
import { ensureDataSources, registerDatasets } from "@/features/reporting/lib/create-report";
import { applyIsmsDashboardTheme, ismsDesignerTheme } from "@/features/reporting/lib/reporting-theme";
import { loadStimulsoftDesigner, type StimulsoftApi } from "@/features/reporting/lib/stimulsoft-client";

interface CustomDashboardDesignerProps {
  id: string;
  template: Record<string, unknown>;
  /** Datasets the current user may open (resolved on the server). */
  datasetKeys: DatasetKey[];
}

/**
 * Dashboard designer locked to ISMS datasets: users can't add connections,
 * data sources or resources, only lay out elements over the catalog data.
 */
function buildDesignerOptions(api: StimulsoftApi) {
  const D = api.Designer;
  const options = new D.StiDesignerOptions();
  options.height = "100%";
  options.appearance.allowChangeWindowTitle = false;
  // Saves go to the database, so skip the "File Name: x.mrt" prompt.
  options.appearance.showSaveDialog = false;
  options.appearance.theme = ismsDesignerTheme(api);
  options.toolbar.showFileMenu = false;
  options.toolbar.showAboutButton = false;
  options.toolbar.showPublishButton = false;
  options.toolbar.showNewPageButton = false;
  options.dictionary.showAdaptersInNewConnectionForm = false;
  // Not None: the Dictionary nests each data source under its connection node,
  // so hiding connections hides every dataset too. View still blocks new ones.
  options.dictionary.dataConnectionsPermissions = D.StiDesignerPermissions.View;
  options.dictionary.dataSourcesPermissions = D.StiDesignerPermissions.View;
  options.dictionary.dataRelationsPermissions = D.StiDesignerPermissions.View;
  options.dictionary.businessObjectsPermissions = D.StiDesignerPermissions.None;
  options.dictionary.resourcesPermissions = D.StiDesignerPermissions.None;
  return options;
}

/** Mount with `key={id}`: the props are only the starting state. */
export function CustomDashboardDesigner(props: CustomDashboardDesignerProps) {
  // Captured once. Router refreshes (session cookie, or revalidation after a
  // save) re-send these props and must not rebuild the designer mid-edit.
  const [{ id, template, datasetKeys }] = useState(props);
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"LOADING" | "READY" | "ERROR">("LOADING");

  useEffect(() => {
    const host = hostRef.current;
    let disposed = false;
    let designer: { dispose(): void } | null = null;
    let renderObserver: MutationObserver | null = null;

    // Last 30 days of real data so elements preview while designing.
    Promise.all([
      loadStimulsoftDesigner(),
      datasetKeys.length > 0
        ? loadDatasetsAction({ keys: datasetKeys, params: defaultDashboardRange(), skipDenied: true })
        : Promise.resolve(null),
    ])
      .then(([api, result]) => {
        if (disposed || !host) return;
        const rows: Partial<Record<DatasetKey, DatasetRow[]>> = {};
        if (result?.success) {
          for (const [key, data] of Object.entries(result.datasets)) if (data) rows[key as DatasetKey] = data.rows;
        }

        const report = new api.Report.StiReport();
        report.load(template);
        ensureDataSources(api, report, datasetKeys);
        registerDatasets(api, report, rows);
        // New elements start on the ISMS style; it's also selectable in the style picker.
        applyIsmsDashboardTheme(api, report);

        const instance = new api.Designer.StiDesigner(buildDesignerOptions(api), `sti-designer-${id}`, false);
        instance.onSaveReport = (args) => {
          const json = JSON.parse(args.report.saveToJsonString()) as Record<string, unknown>;
          void saveCustomDashboardTemplateAction({ id, template: json }).then((saved) => {
            if (saved.success) toast.success("Dashboard saved");
            else toast.error("Could not save dashboard", { description: saved.error });
          });
        };
        // The designer builds its DOM some seconds after renderHtml; keep the
        // loading state until it shows up instead of an empty frame.
        renderObserver = new MutationObserver(() => {
          if (host.childElementCount === 0) return;
          renderObserver?.disconnect();
          if (!disposed) setState("READY");
        });
        renderObserver.observe(host, { childList: true });
        instance.renderHtml(host);
        instance.report = report;
        designer = instance;
      })
      .catch((error: unknown) => {
        console.error("[custom-dashboards] designer failed to load", error);
        if (!disposed) setState("ERROR");
      });

    return () => {
      disposed = true;
      renderObserver?.disconnect();
      designer?.dispose();
      if (host) host.innerHTML = "";
    };
  }, [id, template, datasetKeys]);

  return (
    <div className="relative h-[calc(100dvh-11rem)] min-h-[600px] overflow-hidden rounded-xl border bg-card">
      {state === "LOADING" ? (
        <ReportingLoading label="Loading designer" className="absolute inset-0" />
      ) : null}
      {state === "ERROR" ? (
        <p role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
          The designer could not load. Check your connection and reload the page.
        </p>
      ) : null}
      <div ref={hostRef} className="stimulsoft-host h-full w-full" />
    </div>
  );
}
