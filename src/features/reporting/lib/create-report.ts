import {
  DATASET_CATALOG,
  type DatasetColumnType,
  type DatasetKey,
  type DatasetRow,
} from "@/features/reporting/datasets/dataset-catalog";
import type { StimulsoftApi } from "@/features/reporting/lib/stimulsoft-client";
import type { Stimulsoft } from "stimulsoft-dashboards-js-react/stimulsoft.reports";

export type StiReport = Stimulsoft.Report.StiReport;

/** Stimulsoft uses the native String constructor for System.String columns. */
function columnType(api: StimulsoftApi, type: DatasetColumnType): Stimulsoft.System.Type {
  const resolved = type === "number" ? api.System.Decimal : type === "date" ? api.System.DateTime : String;
  return resolved as unknown as Stimulsoft.System.Type;
}

/**
 * Declares catalog datasets as typed data sources (name = dataset key) so the
 * designer lists proper fields and runtime regData binds by name. Shared with
 * tools/stimulsoft/build-templates.ts.
 */
export function ensureDataSources(api: StimulsoftApi, report: StiReport, keys: readonly DatasetKey[]): void {
  for (const key of keys) {
    if (report.dictionary.dataSources.getByName(key)) continue;
    const source = new api.Report.Dictionary.StiDataTableSource(`${key}.${key}`, key, key);
    for (const column of DATASET_CATALOG[key].columns) {
      source.columns.add(
        new api.Report.Dictionary.StiDataColumn(column.name, column.name, column.label, columnType(api, column.type)),
      );
    }
    report.dictionary.dataSources.add(source);
  }
}

/** Dataset keys a saved template declares (ignores anything outside the catalog). */
export function templateDatasetKeys(template: unknown): DatasetKey[] {
  const sources = (template as { Dictionary?: { DataSources?: Record<string, { Name?: unknown }> } })?.Dictionary
    ?.DataSources;
  if (!sources) return [];
  const keys = Object.values(sources)
    .map((source) => String(source?.Name ?? ""))
    .filter((name): name is DatasetKey => Object.hasOwn(DATASET_CATALOG, name));
  return [...new Set(keys)];
}

/**
 * Attaches server-loaded JSON to a template's data sources by name. Any
 * connection saved inside a template is dropped so a report can never reach
 * a database or URL on its own.
 */
export function registerDatasets(
  api: StimulsoftApi,
  report: StiReport,
  datasets: Partial<Record<DatasetKey, DatasetRow[]>>,
): void {
  report.dictionary.databases.clear();
  for (const [key, rows] of Object.entries(datasets)) {
    const dataSet = new api.System.Data.DataSet(key);
    dataSet.readJson({ [key]: rows ?? [] });
    report.regData(key, key, dataSet);
  }
}

export function setReportVariable(report: StiReport, name: string, value: string): void {
  const variable = report.dictionary.variables.getByName(name);
  if (variable) variable.value = value;
}

export function createReportFromTemplate(
  api: StimulsoftApi,
  template: unknown,
  datasets: Partial<Record<DatasetKey, DatasetRow[]>>,
): StiReport {
  const report = new api.Report.StiReport();
  report.load(template as object);
  registerDatasets(api, report, datasets);
  return report;
}
