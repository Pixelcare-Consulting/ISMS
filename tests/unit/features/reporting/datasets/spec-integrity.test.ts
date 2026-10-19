import { READY_MADE_DASHBOARDS, READY_MADE_KEYS } from "@/features/custom-dashboards/ready-made/ready-made-dashboards";
import { DATASET_CATALOG, isDatasetKey } from "@/features/reporting/datasets/dataset-catalog";
import { REPORT_DEFINITIONS, type ReportDefinition } from "@/features/reporting/reports/report-definitions";
import { READY_MADE_TEMPLATES, REPORT_TEMPLATES } from "@/features/reporting/templates/template-loaders";

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

  it.each(READY_MADE_KEYS)("ready-made %s uses known datasets and columns", (key) => {
    for (const element of READY_MADE_DASHBOARDS[key].spec.sections.flatMap((s) => s.elements)) {
      const names = columnNames(element.datasetKey);
      const referenced = [element.value?.column, element.argument, ...(element.columns ?? []).map((c) => c.column)];
      for (const name of referenced.filter(Boolean)) expect(names).toContain(name);
    }
  });

  it("element names are unique within each ready-made dashboard", () => {
    for (const key of READY_MADE_KEYS) {
      const names = READY_MADE_DASHBOARDS[key].spec.sections.flatMap((s) => s.elements.map((e) => e.name));
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("every ready-made dashboard has a generated template loader", () => {
    expect(Object.keys(READY_MADE_TEMPLATES).sort()).toEqual([...READY_MADE_KEYS].sort());
  });

  it("every report definition has a generated template loader", () => {
    expect(Object.keys(REPORT_TEMPLATES).sort()).toEqual(Object.keys(REPORT_DEFINITIONS).sort());
  });

  it("isDatasetKey rejects prototype keys", () => {
    expect(isDatasetKey("sales_lines")).toBe(true);
    expect(isDatasetKey("toString")).toBe(false);
  });
});
