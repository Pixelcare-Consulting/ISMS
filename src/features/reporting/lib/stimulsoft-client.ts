import type { Stimulsoft as StimulsoftNamespace } from "stimulsoft-dashboards-js-react/stimulsoft.reports";

import { ISMS_THEME } from "@/features/reporting/lib/reporting-theme";

/**
 * Client-only, on-demand loader for Stimulsoft Reports + Dashboards.
 *
 * The modules are several MB each, so they're dynamically imported (own
 * chunks, never in a shared bundle) and cached for the session. They all
 * register onto one `Stimulsoft` global, so the engine must load first.
 * Region maps, markdown and xlsx import are left out on purpose (≈4 MB we
 * don't use).
 */
export type StimulsoftApi = typeof StimulsoftNamespace;

let viewerPromise: Promise<StimulsoftApi> | null = null;
let designerPromise: Promise<StimulsoftApi> | null = null;

function applyLicense(api: StimulsoftApi): void {
  const key = process.env.NEXT_PUBLIC_STIMULSOFT_LICENSE_KEY;
  if (key) {
    api.Base.StiLicense.key = key;
  } else if (process.env.NODE_ENV !== "production") {
    console.warn("[reporting] NEXT_PUBLIC_STIMULSOFT_LICENSE_KEY is not set; Stimulsoft runs in trial mode.");
  }
}

/** TTFs in public/fonts/geist (OFL, from the `geist` package). The weights the templates use. */
const REPORT_FONT_FILES = [
  { path: "/fonts/geist/Geist-Regular.ttf", style: "Regular" },
  { path: "/fonts/geist/Geist-Bold.ttf", style: "Bold" },
] as const;

/**
 * Registers Geist with Stimulsoft so PDF export embeds it. Without this the
 * PDF only names the font and viewers without Geist installed substitute
 * another one. A failure keeps the viewer working with the unembedded font.
 */
async function registerReportFonts(api: StimulsoftApi): Promise<void> {
  // Fetched here rather than via addFontFileAsync, whose callback never fires on a failed download.
  await Promise.all(
    REPORT_FONT_FILES.map(async ({ path, style }) => {
      try {
        const response = await fetch(path, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        api.Base.StiFontCollection.addFontBytes(bytes, ISMS_THEME.fontFamily, api.System.Drawing.FontStyle[style]);
      } catch (error: unknown) {
        console.warn(`[reporting] could not register ${path}; PDFs will not embed it`, error);
      }
    }),
  );
}

async function importViewerModules(): Promise<StimulsoftApi> {
  const { Stimulsoft } = await import("stimulsoft-dashboards-js-react/stimulsoft.reports.engine.mjs");
  await import("stimulsoft-dashboards-js-react/stimulsoft.reports.chart.mjs");
  await import("stimulsoft-dashboards-js-react/stimulsoft.reports.export.mjs");
  await import("stimulsoft-dashboards-js-react/stimulsoft.dashboards.mjs");
  await import("stimulsoft-dashboards-js-react/stimulsoft.viewer.mjs");
  const api = Stimulsoft as StimulsoftApi;
  applyLicense(api);
  await registerReportFonts(api);
  return api;
}

/** Engine + charts + export + dashboards + viewer. */
export function loadStimulsoftViewer(): Promise<StimulsoftApi> {
  viewerPromise ??= importViewerModules().catch((error: unknown) => {
    viewerPromise = null; // allow a retry after a network blip
    throw error;
  });
  return viewerPromise;
}

/** Everything in the viewer bundle plus the dashboard designer. */
export function loadStimulsoftDesigner(): Promise<StimulsoftApi> {
  designerPromise ??= loadStimulsoftViewer()
    .then(async (api) => {
      await import("stimulsoft-dashboards-js-react/stimulsoft.designer.mjs");
      await import("stimulsoft-dashboards-js-react/stimulsoft.blockly.editor.mjs");
      return api;
    })
    .catch((error: unknown) => {
      designerPromise = null;
      throw error;
    });
  return designerPromise;
}

/**
 * Starts loading the viewer once the browser is idle, so a later "Preview"
 * opens fast. Returns a cancel function for effect cleanup.
 */
export function preloadStimulsoftViewer(): () => void {
  const load = () => void loadStimulsoftViewer().catch(() => undefined); // retried on real use
  // Safari has no requestIdleCallback.
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(load, { timeout: 5_000 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(load, 2_000);
  return () => window.clearTimeout(handle);
}
