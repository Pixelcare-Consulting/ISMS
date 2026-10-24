import { sanitizeDashboardTemplate } from "@/features/custom-dashboards/lib/sanitize-template";

const pages = {
  "0": {
    Ident: "StiDashboard",
    Components: { "0": { Ident: "StiIndicatorElement", Value: { Expression: "Sum(sales_kpis.salesThisMonth)" } } },
  },
};

function template(extra: Record<string, unknown> = {}) {
  return {
    Pages: pages,
    Dictionary: {
      Databases: { "0": { Ident: "StiPostgreSQLDatabase", ConnectionString: "Host=db;Password=x" } },
      Resources: {
        "0": { Name: "logo", Type: "Image", Content: "..." },
        "1": { Name: "rows", Type: "Json", Content: "..." },
      },
      DataSources: {
        "0": { Ident: "StiDataTableSource", Name: "sales_kpis" },
        "1": { Ident: "StiDataTableSource", Name: "transfers" },
        "2": { Ident: "StiDataTransformation", Name: "Custom" },
      },
      ...extra,
    },
  };
}

describe("sanitizeDashboardTemplate", () => {
  it("drops database connections and data resources", () => {
    const result = sanitizeDashboardTemplate(template());
    if (!result.ok) throw new Error(result.error);
    const dictionary = result.template.Dictionary as Record<string, unknown>;
    expect(dictionary.Databases).toBeUndefined();
    expect(Object.values(dictionary.Resources as object)).toEqual([{ Name: "logo", Type: "Image", Content: "..." }]);
  });

  it("prunes catalog datasets no element references and re-indexes", () => {
    const result = sanitizeDashboardTemplate(template());
    if (!result.ok) throw new Error(result.error);
    const sources = (result.template.Dictionary as { DataSources: Record<string, { Name: string }> }).DataSources;
    expect(Object.keys(sources)).toEqual(["0", "1"]);
    expect(Object.values(sources).map((s) => s.Name)).toEqual(["sales_kpis", "Custom"]);
  });

  it("rejects non-dashboard payloads", () => {
    expect(sanitizeDashboardTemplate({ foo: 1 })).toEqual({ ok: false, error: "Not a Stimulsoft dashboard" });
  });

  it("rejects oversized templates", () => {
    const result = sanitizeDashboardTemplate({ Pages: pages, Blob: "x".repeat(2_000_001) });
    expect(result.ok).toBe(false);
  });
});
