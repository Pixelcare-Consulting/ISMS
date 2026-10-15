import { prisma } from "@/lib/database/client";

/**
 * Foreign-key lookups a product model points at that must already exist in ISMS.
 *
 * Both the Excel import and the edit sheet resolve through here, so "not available in
 * ISMS" means the same thing on both paths: no auto-creating a brand or category from
 * a typo. Series is deliberately absent — the import still creates new series names.
 */
export const MODEL_LOOKUP_FIELDS = [
  "brand",
  "category",
  "feature",
  "resolution",
  "actualSize",
] as const;

export type ModelLookupField = (typeof MODEL_LOOKUP_FIELDS)[number];

export const MODEL_LOOKUP_LABELS: Record<ModelLookupField, string> = {
  brand: "Brand",
  category: "Category",
  feature: "Feature",
  resolution: "Resolution",
  actualSize: "Actual size",
};

export interface ModelLookupMatch {
  id: string;
  name: string;
  active: boolean;
}

interface LookupSource {
  id: string;
  name: string;
  code?: string | null;
  recordStatus?: string;
}

export interface ModelLookupIndex {
  /** Matches an id, a name, or a code, case-insensitively. */
  find(value: string): ModelLookupMatch | null;
  byId(id: string): ModelLookupMatch | null;
}

export type ModelLookupIndexes = Record<ModelLookupField, ModelLookupIndex>;

function key(value: string): string {
  return value.trim().toLowerCase();
}

function buildIndex(rows: LookupSource[]): ModelLookupIndex {
  const byId = new Map<string, ModelLookupMatch>();
  const byText = new Map<string, ModelLookupMatch>();
  for (const row of rows) {
    // Brands have no record status; every brand counts as active.
    const match = { id: row.id, name: row.name, active: (row.recordStatus ?? "active") === "active" };
    byId.set(row.id, match);
    // First row wins on a collision, so a name never silently resolves to a later twin.
    if (!byText.has(key(row.name))) byText.set(key(row.name), match);
  }
  // Codes rank below names: a code equal to another row's name must not steal it.
  for (const row of rows) {
    const code = row.code?.trim();
    if (code && !byText.has(key(code))) byText.set(key(code), byId.get(row.id)!);
  }
  return {
    find: (value) => byId.get(value.trim()) ?? byText.get(key(value)) ?? null,
    byId: (id) => byId.get(id) ?? null,
  };
}

/** One read per table; each is a tenant-scoped list of tens of rows. */
export async function loadModelLookupIndexes(tenantId: string): Promise<ModelLookupIndexes> {
  const where = { tenantId };
  const [brands, categories, features, resolutions, actualSizes] = await Promise.all([
    prisma.brand.findMany({ where, select: { id: true, name: true, code: true } }),
    prisma.category.findMany({
      where,
      select: { id: true, name: true, code: true, recordStatus: true },
    }),
    prisma.feature.findMany({ where, select: { id: true, name: true, recordStatus: true } }),
    prisma.resolution.findMany({ where, select: { id: true, name: true, recordStatus: true } }),
    prisma.actualSize.findMany({ where, select: { id: true, name: true, recordStatus: true } }),
  ]);
  return {
    brand: buildIndex(brands),
    category: buildIndex(categories),
    feature: buildIndex(features),
    resolution: buildIndex(resolutions),
    actualSize: buildIndex(actualSizes),
  };
}

export function lookupNotAvailableMessage(field: ModelLookupField, value: string): string {
  const label = MODEL_LOOKUP_LABELS[field];
  return `${label} "${value.trim()}" is not available in ISMS. Add it in Master data first.`;
}

export function lookupInactiveMessage(field: ModelLookupField, name: string): string {
  const label = MODEL_LOOKUP_LABELS[field];
  return `${label} "${name}" is inactive. Activate it in Master data or pick an active ${label.toLowerCase()}.`;
}
