import type { SapChangeSet } from "@/features/sap/services/sap-change-notifier";

/**
 * Pure comparisons for the SAP auto-check: given what SAP returned (already through the
 * sync descriptor's own `parse`) and the matching ISMS rows, say what a Sync would create,
 * update or remove.
 *
 * These MIRROR each repository's `applySapSyncPage` / `retireUnseen*` rules rather than
 * calling them, so the sync code stays untouched. If one drifts from its sync the cost is
 * a missed or spurious "please sync" ping — never bad data, because nothing here writes.
 */

/** A row as one of the location syncs (warehouse, branch, service centre) parses it. */
export interface SapLocationRecord {
  code: string;
  name: string;
  isInactive: boolean;
}

export interface IsmsLocationRow {
  code: string;
  name: string;
  deletedAt: Date | null;
  /** Whether the sync would retire this row if SAP stopped returning it. */
  retirable: boolean;
}

const NO_CHANGES: SapChangeSet = { created: [], updated: [], removed: [] };

/** SAP pages by key, so a repeated key is an anomaly; the syncs keep the first. */
function firstByKey<T>(rows: T[], key: (row: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    if (!byKey.has(key(row))) byKey.set(key(row), row);
  }
  return [...byKey.values()];
}

/**
 * Warehouses, branches-from-warehouses and service centres share one shape:
 * - unknown and active in SAP → created (an inactive one is never imported);
 * - known, and the name differs or it should be live but isn't (or the reverse) → updated;
 * - live in ISMS, in the sync's ownership scope, and SAP no longer returns it → removed.
 *
 * SAP returning nothing at all reports nothing: the sync treats that as a broken filter,
 * not an emptied table, and removes nothing either.
 */
export function compareLocations(
  sapRecords: SapLocationRecord[],
  ismsRows: IsmsLocationRow[],
): SapChangeSet {
  if (sapRecords.length === 0) return NO_CHANGES;

  const sap = firstByKey(sapRecords, (row) => row.code);
  const byCode = new Map(ismsRows.map((row) => [row.code, row]));
  const changes: SapChangeSet = { created: [], updated: [], removed: [] };

  for (const record of sap) {
    const match = byCode.get(record.code);
    if (!match) {
      if (!record.isInactive) changes.created.push(record.code);
      continue;
    }
    const shouldBeLive = !record.isInactive;
    const isLive = match.deletedAt === null;
    if (match.name !== record.name || shouldBeLive !== isLive) {
      changes.updated.push(record.code);
    }
  }

  const seen = new Set(sap.map((record) => record.code));
  for (const row of ismsRows) {
    if (row.deletedAt === null && row.retirable && !seen.has(row.code)) {
      changes.removed.push(row.code);
    }
  }

  return changes;
}

/** A SAP item as the model sync's `parse` returns it. */
export interface SapModelRecord {
  skuCode: string;
  name: string;
  /** `SkuStatus` — the sync only ever produces `active` or `retired`. */
  status: string;
  brandName: string;
}

export interface IsmsModelRow {
  skuCode: string;
  name: string;
  description: string | null;
  status: string;
  brandId: string | null;
  deletedAt: Date | null;
}

/** How the model sync matches a brand name — trimmed, case-insensitive. */
export function modelBrandKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Models, from an `UpdateDate` window:
 * - branded and unknown → created, if active (a retired one would land soft-deleted —
 *   nothing anyone would see, so not worth a ping);
 * - branded and known, and name / description / status / brand / live state differ →
 *   updated (a brand ISMS doesn't have yet counts as different: the sync would create it);
 * - SAP item now unbranded (`unbrandedSkus`) while still live in ISMS → removed.
 *
 * `seriesId` is left out on purpose: the sync fills it from ISMS's own series codes, not
 * from SAP, so it is never SAP news.
 */
export function compareModels(
  sapRecords: SapModelRecord[],
  unbrandedSkus: string[],
  ismsRows: IsmsModelRow[],
  brandIdByKey: Map<string, string>,
): SapChangeSet {
  const sap = firstByKey(sapRecords, (row) => row.skuCode);
  const bySku = new Map(ismsRows.map((row) => [row.skuCode, row]));
  const changes: SapChangeSet = { created: [], updated: [], removed: [] };

  for (const record of sap) {
    const match = bySku.get(record.skuCode);
    if (!match) {
      if (record.status === "active") changes.created.push(record.skuCode);
      continue;
    }
    const brandId = brandIdByKey.get(modelBrandKey(record.brandName)) ?? null;
    const shouldBeLive = record.status === "active";
    if (
      match.name !== record.name ||
      match.description !== record.name ||
      match.status !== record.status ||
      match.brandId !== brandId ||
      (match.deletedAt === null) !== shouldBeLive
    ) {
      changes.updated.push(record.skuCode);
    }
  }

  const branded = new Set(sap.map((record) => record.skuCode));
  for (const sku of new Set(unbrandedSkus)) {
    const match = bySku.get(sku);
    if (match && match.deletedAt === null && !branded.has(sku)) changes.removed.push(sku);
  }

  return changes;
}

/** Most serials the check remembers as "in SAP, not yet in ISMS". */
export const SAP_PENDING_SERIALS_CAP = 5_000;

/**
 * Serial numbers waiting to be synced: what was already pending plus the newly seen ones,
 * minus any ISMS now holds live. Capped so a huge backlog can't bloat the watch row; the
 * notification then says "5,000+".
 */
export function nextPendingSerials(
  pending: string[],
  newlySeen: string[],
  liveInIsms: Set<string>,
): { pending: string[]; capped: boolean } {
  const all = [...new Set([...pending, ...newlySeen])].filter((serial) => !liveInIsms.has(serial));
  return {
    pending: all.slice(0, SAP_PENDING_SERIALS_CAP),
    capped: all.length > SAP_PENDING_SERIALS_CAP,
  };
}
