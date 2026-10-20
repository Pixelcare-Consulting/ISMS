"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import {
  saveCustomDashboardTemplateAction,
  updateCustomDashboardPeriodAction,
} from "@/features/custom-dashboards/actions/custom-dashboard.actions";
import { DashboardPeriodSelect } from "@/features/custom-dashboards/components/dashboard-period-select";
import { resolveDashboardPeriod } from "@/features/custom-dashboards/lib/dashboard-period";
import {
  CUSTOM_DASHBOARD_PERIOD_LABELS,
  type CustomDashboardPeriod,
} from "@/features/custom-dashboards/schemas/custom-dashboard.schema";
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
  defaultPeriod: CustomDashboardPeriod;
}

type PreviewRows = Partial<Record<DatasetKey, DatasetRow[]>>;
type StiDesignerInstance = InstanceType<StimulsoftApi["Designer"]["StiDesigner"]>;

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

/** Real rows for the period, so elements preview what viewers will open on. */
async function loadPreviewRows(keys: DatasetKey[], period: CustomDashboardPeriod): Promise<PreviewRows> {
  if (keys.length === 0) return {};
  const result = await loadDatasetsAction({ keys, params: resolveDashboardPeriod(period), skipDenied: true });
  if (!result.success) throw new Error(result.error);
  const rows: PreviewRows = {};
  for (const [key, data] of Object.entries(result.datasets)) if (data) rows[key as DatasetKey] = data.rows;
  return rows;
}

/**
 * The designer only re-reads data when its report is replaced, so rebuild one
 * from the live layout. Unsaved edits survive; the undo history does not.
 */
function swapPreviewRows(api: StimulsoftApi, designer: StiDesignerInstance, keys: DatasetKey[], rows: PreviewRows) {
  if (!designer.report) return;
  const next = new api.Report.StiReport();
  next.load(designer.report.saveToJsonString());
  ensureDataSources(api, next, keys);
  registerDatasets(api, next, rows);
  designer.report = next;
}

/** Mount with `key={id}`: the props are only the starting state. */
export function CustomDashboardDesigner(props: CustomDashboardDesignerProps) {
  // Captured once. Router refreshes (session cookie, or revalidation after a
  // save) re-send these props and must not rebuild the designer mid-edit.
  const [{ id, template, datasetKeys, defaultPeriod: initialPeriod }] = useState(props);
  const hostRef = useRef<HTMLDivElement>(null);
  const designerRef = useRef<{ api: StimulsoftApi; instance: StiDesignerInstance } | null>(null);
  const [state, setState] = useState<"LOADING" | "READY" | "ERROR">("LOADING");
  const [period, setPeriod] = useState(initialPeriod);
  const [periodPending, setPeriodPending] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    let disposed = false;
    let designer: StiDesignerInstance | null = null;
    let renderObserver: MutationObserver | null = null;

    Promise.all([
      loadStimulsoftDesigner(),
      loadPreviewRows(datasetKeys, initialPeriod).catch((error: unknown) => {
        // Layout still works without data; elements just preview empty.
        console.error("[custom-dashboards] preview data failed to load", error);
        toast.error("Preview data could not load", { description: "Elements will show empty until you reload." });
        return {};
      }),
    ])
      .then(([api, rows]) => {
        if (disposed || !host) return;

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
        designerRef.current = { api, instance };
      })
      .catch((error: unknown) => {
        console.error("[custom-dashboards] designer failed to load", error);
        if (!disposed) setState("ERROR");
      });

    return () => {
      disposed = true;
      designerRef.current = null;
      renderObserver?.disconnect();
      designer?.dispose();
      if (host) host.innerHTML = "";
    };
  }, [id, template, datasetKeys, initialPeriod]);

  async function changePeriod(next: CustomDashboardPeriod) {
    const previous = period;
    setPeriod(next);
    setPeriodPending(true);
    try {
      const saved = await updateCustomDashboardPeriodAction({ id, period: next });
      if (!saved.success) {
        setPeriod(previous);
        toast.error("Could not save the default period", { description: saved.error });
        return;
      }
      const current = designerRef.current;
      if (current) swapPreviewRows(current.api, current.instance, datasetKeys, await loadPreviewRows(datasetKeys, next));
      toast.success(`Default period set to ${CUSTOM_DASHBOARD_PERIOD_LABELS[next]}`);
    } catch (error: unknown) {
      // The period is saved at this point; only the preview refresh failed.
      console.error("[custom-dashboards] preview reload failed", error);
      toast.error("Default period saved, but the preview could not reload", { description: "Reload the page to see it." });
    } finally {
      setPeriodPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="custom-dashboard-default-period">Default period</Label>
        <DashboardPeriodSelect
          id="custom-dashboard-default-period"
          value={period}
          onChange={(next) => void changePeriod(next)}
          disabled={state !== "READY" || periodPending}
        />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {periodPending ? "Updating preview…" : "Viewers open the dashboard on this period and can switch it."}
        </p>
      </div>
      <div className="relative h-[calc(100dvh-14rem)] min-h-[600px] overflow-hidden rounded-xl border bg-card">
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
    </div>
  );
}
