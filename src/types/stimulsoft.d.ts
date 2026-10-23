// Deep ESM entry points of stimulsoft-dashboards-js-react ship without their
// own declarations. They all register onto (and re-export) one Stimulsoft
// namespace, typed by the package's stimulsoft.reports.d.ts.
declare module "stimulsoft-dashboards-js-react/stimulsoft.reports.engine.mjs" {
  export { Stimulsoft } from "stimulsoft-dashboards-js-react/stimulsoft.reports";
}
declare module "stimulsoft-dashboards-js-react/stimulsoft.reports.chart.mjs";
declare module "stimulsoft-dashboards-js-react/stimulsoft.reports.export.mjs";
declare module "stimulsoft-dashboards-js-react/stimulsoft.dashboards.mjs";
declare module "stimulsoft-dashboards-js-react/stimulsoft.viewer.mjs";
declare module "stimulsoft-dashboards-js-react/stimulsoft.designer.mjs";
declare module "stimulsoft-dashboards-js-react/stimulsoft.blockly.editor.mjs";
