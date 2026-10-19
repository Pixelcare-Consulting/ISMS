"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/utils/cn";
import { ReportingLoading } from "@/features/reporting/components/reporting-loading";
import type { StiReport } from "@/features/reporting/lib/create-report";
import { ismsViewerTheme } from "@/features/reporting/lib/reporting-theme";
import { loadStimulsoftViewer, type StimulsoftApi } from "@/features/reporting/lib/stimulsoft-client";

interface StimulsoftViewerProps {
  /** Builds the report once Stimulsoft is loaded. Return a new report to refresh. */
  createReport: (api: StimulsoftApi) => StiReport;
  /** Dashboards fill the frame; paged reports keep the print toolbar. */
  variant: "REPORT" | "DASHBOARD";
  /** Classes sizing the frame (height or aspect ratio). The viewer fills it. */
  frameClassName?: string;
}

function buildOptions(api: StimulsoftApi, variant: StimulsoftViewerProps["variant"]) {
  const options = new api.Viewer.StiViewerOptions();
  // Fill the frame so it can resize without re-creating the viewer.
  options.height = "100%";
  options.appearance.scrollbarsMode = true;
  options.appearance.fullScreenMode = false;
  options.appearance.theme = ismsViewerTheme(api);
  options.toolbar.showOpenButton = false;
  options.toolbar.showDesignButton = false;
  options.toolbar.showAboutButton = false;
  options.toolbar.showSendEmailButton = false;
  options.toolbar.showEditorButton = false;
  options.toolbar.showSignatureButton = false;
  if (variant === "REPORT") {
    options.toolbar.zoom = api.Viewer.StiZoomMode.PageWidth;
  } else {
    options.toolbar.showFirstPageButton = false;
    options.toolbar.showPreviousPageButton = false;
    options.toolbar.showNextPageButton = false;
    options.toolbar.showLastPageButton = false;
    options.toolbar.showViewModeButton = false;
  }
  return options;
}

/**
 * Resolves once the element has a layout size. Stimulsoft measures its host on
 * creation; Safari renders a blank page if that happens at 0×0 (e.g. while a
 * dialog is still laying out).
 */
function whenSized(element: HTMLElement | null, track: (observer: ResizeObserver) => void): Promise<void> {
  if (!element || (element.clientWidth > 0 && element.clientHeight > 0)) return Promise.resolve();
  return new Promise((resolve) => {
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === 0 || element.clientHeight === 0) return;
      observer.disconnect();
      resolve();
    });
    track(observer);
    observer.observe(element);
  });
}

/**
 * Hosts a Stimulsoft viewer. Stimulsoft scripts load on first mount only;
 * the viewer instance is disposed on unmount.
 */
export function StimulsoftViewer({ createReport, variant, frameClassName = "h-[720px]" }: StimulsoftViewerProps) {
  const reactId = useId();
  const viewerId = `sti-viewer-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"LOADING" | "READY" | "ERROR">("LOADING");

  useEffect(() => {
    const host = hostRef.current;
    let disposed = false;
    let viewer: { dispose(): void } | null = null;

    let sizeObserver: ResizeObserver | null = null;

    loadStimulsoftViewer()
      .then((api) => whenSized(host, (observer) => (sizeObserver = observer)).then(() => api))
      .then((api) => {
        if (disposed || !host) return;
        const instance = new api.Viewer.StiViewer(buildOptions(api, variant), viewerId, false);
        instance.renderHtml(host);
        instance.report = createReport(api);
        viewer = instance;
        setState("READY");
      })
      .catch((error: unknown) => {
        console.error("[reporting] viewer failed to load", error);
        if (!disposed) setState("ERROR");
      });

    return () => {
      disposed = true;
      sizeObserver?.disconnect();
      viewer?.dispose();
      if (host) host.innerHTML = "";
    };
  }, [createReport, variant, viewerId]);

  return (
    <div className={cn("relative min-h-60 overflow-hidden rounded-xl border bg-card", frameClassName)}>
      {state === "LOADING" ? (
        <ReportingLoading label="Preparing the viewer" className="absolute inset-0" />
      ) : null}
      {state === "ERROR" ? (
        <div role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
          The report viewer could not load. Check your connection and reload the page.
        </div>
      ) : null}
      <div ref={hostRef} className="stimulsoft-host h-full w-full" />
    </div>
  );
}
