import { sapKeyLiteral } from "@/features/sap/services/sap-master-data";
import type { SapSyncSegment } from "@/features/sap/types/sap-sync-entity";

/**
 * Planning for a *segmented* walk — the pure half of it, with no Service Layer or database
 * anywhere, so it can be reasoned about (and exercised) on its own.
 *
 * A segmented sync reads a child entity restricted to the parent keys ISMS holds: OSRN
 * serials for the items in `product_models`. That key set is routinely far larger than one
 * Service Layer URL can carry, so the walk runs in two dimensions — across *segments* of
 * keys, and by the entity's own key inside each segment. Everything here exists to make
 * those two positions resumable across the several runs a pass takes.
 *
 * See `SapSyncSegment` for why an entity opts into this, and `sap-sync-engine.ts` for the
 * loop that drives it.
 */

/**
 * How many characters one segment's key chain may take, counted as plain text.
 *
 * The client's Service Layer refuses a query string over 2048 characters ("Query string
 * exceeds the maximum length 2048", measured 2026-10-28), and it counts the decoded text,
 * not the URL-encoded form. The rest of the query — `$select`, `$orderby`, the entity
 * filter, the resume clause — has to fit alongside the chain, hence the headroom.
 * Overridable with `SAP_SYNC_SEGMENT_BUDGET` for a Service Layer with another limit.
 */
const DEFAULT_SEGMENT_BUDGET = 1600;

export function segmentBudget(): number {
  const raw = Number.parseInt(process.env.SAP_SYNC_SEGMENT_BUDGET ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SEGMENT_BUDGET;
}

/**
 * `(ItemCode eq 'A' or ItemCode eq 'B')`.
 *
 * Deliberately an `or` chain and not `in`: `in` arrived with OData 4.01 and older Service
 * Layer builds reject it outright, while `or` is understood by every version.
 */
/** What the planning needs of a segment: which field to match and how to quote it. */
export type SegmentField = Pick<SapSyncSegment, "field" | "kind">;

export function segmentClause(segment: SegmentField, keys: string[]): string {
  const terms = keys.map((key) => `${segment.field} eq ${sapKeyLiteral(key, segment.kind)}`);
  return `(${terms.join(" or ")})`;
}

/** What one key costs the query string as SAP counts it (plain text), separator included. */
function termCost(segment: SegmentField, key: string): number {
  return `${segment.field} eq ${sapKeyLiteral(key, segment.kind)} or `.length;
}

/**
 * Split `keys` (in their given order) into batches whose `or` chains each fit one Service
 * Layer request. Any read that filters on a list of keys goes through this, so none can
 * cross the Service Layer's query-string limit (see `DEFAULT_SEGMENT_BUDGET`).
 */
export function chunkKeysForFilter(keys: readonly string[], segment: SegmentField): string[][] {
  const budget = segmentBudget();
  const batches: string[][] = [];
  let batch: string[] = [];
  let cost = 0;
  for (const key of keys) {
    const next = termCost(segment, key);
    if (batch.length > 0 && cost + next > budget) {
      batches.push(batch);
      batch = [];
      cost = 0;
    }
    batch.push(key);
    cost += next;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

export interface SegmentPlan {
  /** The segment's first key — stored in the cursor so a resume re-plans this segment. */
  anchor: string;
  keys: string[];
  /** First key of the following segment, or null when this is the last one. */
  next: string | null;
}

/**
 * The next segment to walk: as many keys from `anchor` onward as one request can carry.
 *
 * Sized by characters rather than by a key count, so the same descriptor behaves at
 * five hundred keys and at five hundred thousand, and a company whose item codes are long
 * gets smaller segments rather than a truncated URL. At least one key is always taken —
 * a single key over budget still has to be walked, and SAP will refuse it more
 * informatively than a silent skip would.
 *
 * `sortedKeys` must be sorted, and sorted the same way on every run of a pass: the anchor
 * is only meaningful against a stable ordering. The comparison is JavaScript's, never
 * SAP's — segment membership is an explicit `or` list, so unlike a `gt` walk this never
 * depends on the company database's collation.
 */
export function planSegment(
  sortedKeys: string[],
  anchor: string | null,
  segment: SegmentField,
): SegmentPlan | null {
  // First key at or after the anchor, so a key removed from ISMS mid-pass cannot strand
  // the cursor on a segment that no longer starts anywhere.
  let start = 0;
  if (anchor !== null) {
    while (start < sortedKeys.length && sortedKeys[start] < anchor) start += 1;
  }
  if (start >= sortedKeys.length) return null;

  const budget = segmentBudget();
  const keys: string[] = [];
  let cost = 0;
  for (let i = start; i < sortedKeys.length; i += 1) {
    const next = termCost(segment, sortedKeys[i]);
    if (keys.length > 0 && cost + next > budget) break;
    keys.push(sortedKeys[i]);
    cost += next;
  }

  const end = start + keys.length;
  return {
    anchor: sortedKeys[start],
    keys,
    next: end < sortedKeys.length ? sortedKeys[end] : null,
  };
}

/** Where a segmented walk has got to: which segment, and where inside it. */
export interface SegmentedPosition {
  anchor: string | null;
  lastKey: string | null;
}

/**
 * A segmented walk has two positions but one `lastKey` column, so the pair is stored as
 * JSON. Encoding rather than delimiting keeps it safe for keys containing any character.
 */
export function encodePosition(position: SegmentedPosition): string {
  return JSON.stringify({ a: position.anchor, k: position.lastKey });
}

export function decodePosition(raw: string | null): SegmentedPosition {
  if (raw === null) return { anchor: null, lastKey: null };
  try {
    const parsed = JSON.parse(raw) as { a?: unknown; k?: unknown };
    return {
      anchor: typeof parsed.a === "string" ? parsed.a : null,
      lastKey: typeof parsed.k === "string" ? parsed.k : null,
    };
  } catch {
    // A cursor written before the entity became segmented is a bare key and cannot say
    // which segment it belonged to, so the pass restarts. That costs a re-read of rows
    // already applied — every write is an upsert — and never costs data.
    return { anchor: null, lastKey: null };
  }
}

/**
 * Where a *targeted* walk stopped. Unlike a pass, a targeted run owns no cursor row: its
 * place goes back to the caller with the result and comes back with the next call.
 *
 * `rows` is how many rows earlier slices of the same targeted run read, so progress
 * keeps counting up across slices the way `passRows` does for a pass.
 */
export interface TargetedResume {
  position: SegmentedPosition;
  rows: number;
}

export function encodeTargetedResume(resume: TargetedResume): string {
  return JSON.stringify({ a: resume.position.anchor, k: resume.position.lastKey, n: resume.rows });
}

/**
 * Read a resume token the client handed back. It is untrusted input, and `lastKey` goes
 * into the `$filter`: a numeric key is spliced in unquoted, so anything that is not a
 * plain integer restarts the walk rather than reaching SAP. Restarting costs a re-read,
 * never data — every write is an upsert.
 */
export function decodeTargetedResume(
  raw: string | null | undefined,
  keyKind: SapSyncSegment["kind"],
): TargetedResume {
  const fresh: TargetedResume = { position: { anchor: null, lastKey: null }, rows: 0 };
  if (!raw) return fresh;
  try {
    const parsed = JSON.parse(raw) as { a?: unknown; k?: unknown; n?: unknown };
    const anchor = typeof parsed.a === "string" ? parsed.a : null;
    const lastKey = typeof parsed.k === "string" ? parsed.k : null;
    if (lastKey !== null && keyKind === "number" && !/^\d+$/.test(lastKey)) return fresh;
    const rows =
      typeof parsed.n === "number" && Number.isSafeInteger(parsed.n) && parsed.n > 0 ? parsed.n : 0;
    return { position: { anchor, lastKey }, rows };
  } catch {
    return fresh;
  }
}
