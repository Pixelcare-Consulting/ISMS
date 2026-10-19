import { ANALYTICS_SECTIONS } from "@/features/reporting/dashboards/analytics-layout";
import { DATASET_CATALOG, isDatasetKey } from "@/features/reporting/datasets/dataset-catalog";
import { REPORT_DEFINITIONS, type ReportDefinition } from "@/features/reporting/reports/report-definitions";
import { REPORT_TEMPLATES } from "@/features/reporting/templates/template-loaders";

function columnNames(key: keyof typeof DATASET_CATALOG): Set<string> {
  return new Set(DATASET_CATALOG[key].columns.map((c) => c.name));
}

describe("reporting specs reference real catalog columns", () => {
  it.each(Object.entries(REPORT_DEFINITIONS) as [string, ReportDefinition][])("report %s", (_key, def) => {
    for (const section of def.sections) {
      const names = columnNames(section.datasetKey);
      for (const column of section.columns) expect(names).toContain(column.name);
      if (section.groupBy) expect(names).toContain(section.groupBy);
      for (const column of section.columns.filter((c) => c.total)) {
        const meta = DATASET_CATALOG[section.datasetKey].columns.find((c) => c.name === column.name);
        expect(meta?.type).toBe("number");
      }
    }
  });

  it("analytics elements use known datasets and columns", () => {
    for (const element of ANALYTICS_SECTIONS.flatMap((s) => s.elements)) {
      const names = columnNames(element.datasetKey);
      for (const name of [element.value, element.argument, ...(element.columns ?? [])].filter(Boolean)) {
        expect(names).toContain(name);
      }
    }
  });

  it("analytics element names are unique", () => {
    const names = ANALYTICS_SECTIONS.flatMap((s) => s.elements.map((e) => e.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it("every report definition has a generated template loader", () => {
    expect(Object.keys(REPORT_TEMPLATES).sort()).toEqual(Object.keys(REPORT_DEFINITIONS).sort());
  });

  it("isDatasetKey rejects prototype keys", () => {
    expect(isDatasetKey("sales_lines")).toBe(true);
    expect(isDatasetKey("toString")).toBe(false);
  });
});
