import { MAX_TEMPLATE_BYTES } from "@/features/custom-dashboards/schemas/custom-dashboard.schema";
import { isDatasetKey } from "@/features/reporting/datasets/dataset-catalog";

/** Resource types that carry no data (images and fonts). */
const ALLOWED_RESOURCE_TYPES = new Set(["Image", "FontTtf", "FontOtf", "FontTtc", "FontWoff", "FontEot"]);

export type SanitizeResult = { ok: true; template: Record<string, unknown> } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A custom dashboard may only store layout. Database connections and
 * embedded data files are removed so a saved dashboard can never reach a
 * database or URL, or carry another user's data; rows always come from the
 * dataset registry with the viewer's own access.
 */
export function sanitizeDashboardTemplate(template: Record<string, unknown>): SanitizeResult {
  if (JSON.stringify(template).length > MAX_TEMPLATE_BYTES) {
    return { ok: false, error: "Dashboard is too large to save" };
  }
  if (!isRecord(template.Pages)) {
    return { ok: false, error: "Not a Stimulsoft dashboard" };
  }

  const next: Record<string, unknown> = { ...template };
  if (isRecord(next.Dictionary)) {
    const dictionary: Record<string, unknown> = { ...next.Dictionary };
    delete dictionary.Databases;
    if (isRecord(dictionary.Resources)) {
      dictionary.Resources = Object.fromEntries(
        Object.entries(dictionary.Resources).filter(
          ([, resource]) => isRecord(resource) && ALLOWED_RESOURCE_TYPES.has(String(resource.Type)),
        ),
      );
    }
    if (isRecord(dictionary.DataSources)) {
      dictionary.DataSources = pruneUnusedDatasets(dictionary.DataSources, next.Pages, dictionary);
    }
    next.Dictionary = dictionary;
  }
  return { ok: true, template: next };
}

/**
 * The designer declares every dataset the author can open; keep only the ones
 * an element, variable or other data source references ("key.column"), so
 * viewers don't fetch data the dashboard never shows.
 */
function pruneUnusedDatasets(
  sources: Record<string, unknown>,
  pages: unknown,
  dictionary: Record<string, unknown>,
): Record<string, unknown> {
  const entries = Object.entries(sources);
  const kept = entries.filter(([entryKey, source]) => {
    const name = isRecord(source) ? String(source.Name ?? "") : "";
    if (!isDatasetKey(name)) return true;
    const others = entries.filter(([key]) => key !== entryKey).map(([, other]) => other);
    const haystack = JSON.stringify([pages, dictionary.Variables, others]);
    return haystack.includes(`${name}.`);
  });
  // Stimulsoft collections are keyed "0", "1", …; re-index after filtering.
  return Object.fromEntries(kept.map(([, source], index) => [String(index), source]));
}
