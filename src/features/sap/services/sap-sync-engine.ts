import { auditService } from "@/features/audit/services/audit.service";
import { sapSyncCursorRepository } from "@/features/sap/repositories/sap-sync-cursor.repository";
import type { SapSyncEntity, SapSyncTarget } from "@/features/sap/types/sap-sync-entity";
import type { SapSyncResult, SapSyncSkip } from "@/features/sap/schemas/sap-master-sync.schema";
import {
  sapPageSize,
  sapErrorMessage,
  sapKeyLiteral,
} from "@/features/sap/services/sap-master-data";
import {
  decodePosition,
  decodeTargetedResume,
  encodePosition,
  encodeTargetedResume,
  planSegment,
  segmentClause,
  type SegmentedPosition,
  type SegmentField,
} from "@/features/sap/services/sap-sync-segment";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import { SAP_NO_CONNECTION_MESSAGE } from "@/config/platform";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";
import { withSapSyncLock } from "@/features/sap/services/sap-sync-lock";
import { logger } from "@/lib/shared/logger";

/**
 * One engine for every SAP → ISMS master-data sync.
 *
 * The shape of the work is the same whether the entity holds two rows or four million:
 * walk it in key order, apply each page, remember where you stopped. What differs is only
 * how many runs a full walk (a *pass*) takes. See `SapSyncCursor` in the schema for why a
 * pass repeats rather than reading forward forever.
 *
 * Everything entity-specific — the Service Layer query, how a SAP row maps to an ISMS
 * record, how a page is written — lives in the `SapSyncEntity` descriptor the caller
 * hands in. Nothing in here knows what a dealer or a serial is.
 */

/**
 * How long one run may spend before it stops and saves its place.
 *
 * Every sync is sliceable, so this is a stopping rule rather than a limit on the work: a
 * small entity finishes its pass long before the budget, a large one comes back to it.
 * The default leaves headroom under a 300s function timeout for the last page's writes
 * and the audit record.
 */
const DEFAULT_BUDGET_MS = 240_000;

function budgetMs(override?: number): number {
  if (override && override > 0) return override;
  const raw = Number.parseInt(process.env.SAP_SYNC_BUDGET_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_BUDGET_MS;
}

/** Distinct examples kept per skip reason — enough to act on, not a wall of text. */
const MAX_SKIP_EXAMPLES = 20;

/**
 * The `$filter` for one page: the entity's own filter, the segment being walked if there
 * is one, and where the last page ended.
 */
function pageFilter(
  entity: SapSyncEntity,
  lastKey: string | null,
  segment?: string,
): string | undefined {
  const clauses: string[] = [];
  if (entity.filter) clauses.push(entity.filter);
  if (segment) clauses.push(segment);
  if (lastKey !== null) {
    clauses.push(`${entity.keyField} gt ${sapKeyLiteral(lastKey, entity.keyKind)}`);
  }
  return clauses.length > 0 ? clauses.join(" and ") : undefined;
}

interface SapCollectionResponse {
  value?: Record<string, unknown>[];
}

async function fetchPage(
  creds: SapServiceLayerCredentials,
  entity: SapSyncEntity,
  lastKey: string | null,
  segment?: string,
): Promise<Record<string, unknown>[]> {
  const params = [`$select=${entity.select}`, `$orderby=${entity.keyField}`];
  const filter = pageFilter(entity, lastKey, segment);
  if (filter) params.splice(1, 0, `$filter=${encodeURIComponent(filter)}`);

  const response = await sapServiceLayerClient.request<SapCollectionResponse>({
    creds,
    method: "GET",
    path: `/${entity.entity}?${params.join("&")}`,
    // Service Layer caps page size server-side (default 20) and ignores `$top`; this is
    // what raises that cap. SAP may still return fewer rows than asked, which is fine —
    // paging follows the rows it actually got.
    headers: { Prefer: `odata.maxpagesize=${sapPageSize()}` },
  });

  if (response.statusCode >= 400) {
    throw new Error(sapErrorMessage(response.statusCode, response.rawBody, entity.entity));
  }
  return response.data?.value ?? [];
}

/**
 * SAP's row count for the entity, measured once per pass as the progress denominator.
 * A failure here is not worth failing a sync over — progress just goes unreported.
 */
async function measureTotal(
  creds: SapServiceLayerCredentials,
  entity: SapSyncEntity,
): Promise<number | null> {
  try {
    const query = entity.filter ? `?$filter=${encodeURIComponent(entity.filter)}` : "";
    const response = await sapServiceLayerClient.request({
      creds,
      method: "GET",
      path: `/${entity.entity}/$count${query}`,
    });
    const total = Number.parseInt((response.rawBody ?? "").trim(), 10);
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

/**
 * Where this page ends, so the next one can resume after it.
 *
 * Read from the raw SAP row rather than from the records we kept: a page whose rows were
 * all skipped still has to move the cursor, or the sync would ask for the same page
 * forever. Rows without a key cannot anchor anything — if a whole page has none, stopping
 * is the only safe answer, since advancing past it would need a position we do not have.
 */
function pageEndKey(rows: Record<string, unknown>[], entity: SapSyncEntity): string {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const value = rows[i][entity.keyField];
    if (value !== null && value !== undefined && String(value) !== "") return String(value);
  }
  throw new Error(
    `SAP returned ${rows.length} ${entity.entity} rows with no ${entity.keyField}, ` +
      `so the sync cannot tell where to continue from.`,
  );
}

/** Collect skips by reason — at four million rows a per-row list is unreadable. */
class SkipTally {
  private readonly byReason = new Map<string, { count: number; examples: Set<string> }>();

  add(reason: string, example?: string | null) {
    const entry = this.byReason.get(reason) ?? { count: 0, examples: new Set<string>() };
    entry.count += 1;
    if (example && entry.examples.size < MAX_SKIP_EXAMPLES) entry.examples.add(example);
    this.byReason.set(reason, entry);
  }

  toList(): SapSyncSkip[] {
    return [...this.byReason.entries()].map(([reason, entry]) => ({
      reason,
      count: entry.count,
      examples: [...entry.examples],
    }));
  }
}

/** What one run wrote, across every page it applied. */
interface RunTotals {
  fetched: number;
  pages: number;
  created: number;
  updated: number;
  unchanged: number;
}

/** Parse and write pages for one run, folding what each did into `totals` and `skips`. */
function createPageApplier(
  tenantId: string,
  entity: SapSyncEntity,
  context: unknown,
  passMark: Date,
  skips: SkipTally,
): { totals: RunTotals; applyRows(rows: Record<string, unknown>[]): Promise<void> } {
  const totals: RunTotals = { fetched: 0, pages: 0, created: 0, updated: 0, unchanged: 0 };

  async function applyRows(rows: Record<string, unknown>[]): Promise<void> {
    const records: unknown[] = [];
    for (const row of rows) {
      const parsed = entity.parse(row, context);
      if ("skip" in parsed) skips.add(parsed.skip, parsed.example);
      else records.push(parsed.record);
    }

    if (records.length > 0) {
      const applied = await entity.applyPage(tenantId, records);
      totals.created += applied.created;
      totals.updated += applied.updated;
      totals.unchanged += applied.unchanged;
      for (const failure of applied.failures) skips.add(failure.reason, failure.example);

      // Every parsed row is still in SAP, written or not: a row that failed to update is
      // stale, not gone, and must not be retired for it.
      await entity.reconcile.markSeen(tenantId, records, passMark);
    }

    totals.fetched += rows.length;
    totals.pages += 1;
  }

  return { totals, applyRows };
}

/**
 * Walk `keys` in segments, paging by the entity's key inside each, from `start` until the
 * keys run out or `deadline` passes. `onAdvance` is told every new position, so a caller
 * can persist it (a pass) or just keep the last one (a targeted run).
 */
async function walkSegments(walk: {
  creds: SapServiceLayerCredentials;
  entity: SapSyncEntity;
  segment: SegmentField;
  keys: string[];
  start: SegmentedPosition;
  deadline: number;
  applyRows(rows: Record<string, unknown>[]): Promise<void>;
  onAdvance(position: SegmentedPosition): Promise<void>;
}): Promise<{ completed: boolean; position: SegmentedPosition }> {
  // Sorted and de-duplicated so segment boundaries fall in the same places on every run
  // of a pass — the cursor's anchor is only meaningful against a stable ordering. The
  // comparison is JavaScript's, never SAP's: segment membership is an explicit `or`
  // list, so unlike a `gt` walk this never depends on the company database's collation.
  const keys = [...new Set(walk.keys)].sort();
  let position = walk.start;

  for (;;) {
    const plan = planSegment(keys, position.anchor, walk.segment);
    // No segment left to start: every key has been walked.
    if (!plan) return { completed: true, position };

    const rows = await fetchPage(
      walk.creds,
      walk.entity,
      position.lastKey,
      segmentClause(walk.segment, plan.keys),
    );

    if (rows.length === 0) {
      // This segment is exhausted; move to the next one, or finish.
      if (plan.next === null) return { completed: true, position };
      position = { anchor: plan.next, lastKey: null };
    } else {
      const endKey = pageEndKey(rows, walk.entity);
      await walk.applyRows(rows);
      position = { anchor: plan.anchor, lastKey: endKey };
    }

    // Reported per page and per segment hop alike: an interrupted run loses one page of
    // progress, never its place in the key set.
    await walk.onAdvance(position);

    if (Date.now() >= walk.deadline) return { completed: false, position };
  }
}

async function requireCredentials(tenantId: string): Promise<SapServiceLayerCredentials> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) {
    throw new Error(SAP_NO_CONNECTION_MESSAGE);
  }
  return creds;
}

async function runSlice(
  tenantId: string,
  entity: SapSyncEntity,
  actorUserId: string | null,
  options?: { budgetMs?: number },
): Promise<SapSyncResult> {
  const creds = await requireCredentials(tenantId);

  let cursor = await sapSyncCursorRepository.get(tenantId, entity.key);

  // A pass in progress is resumed; otherwise one starts here. Measuring the row count is
  // part of starting, so the denominator belongs to the pass it describes.
  //
  // A segmented entity has no denominator: `$count` would have to be asked once per
  // segment before a single row is read, which on a large key set is minutes of stalling
  // to populate a progress bar. The engine already treats a missing total as "progress
  // unreported", so that is what a segmented walk reports.
  if (cursor.passStartedAt === null) {
    cursor = await sapSyncCursorRepository.beginPass(
      tenantId,
      entity.key,
      entity.segment ? null : await measureTotal(creds, entity),
    );
  }

  // Every row a page names is stamped with this, and a completed pass retires rows that
  // were never stamped. It is the pass's own start time, so it is the same value on every
  // run of a multi-run pass and never depends on this server's clock agreeing with SAP's.
  const passMark = cursor.passStartedAt ?? new Date();

  const context = await entity.prepare?.(tenantId);
  const deadline = Date.now() + budgetMs(options?.budgetMs);
  const skips = new SkipTally();
  const { totals, applyRows } = createPageApplier(tenantId, entity, context, passMark, skips);
  const passRowsNow = () => cursor.passRows + totals.fetched;

  let removed = 0;
  let completed = false;

  if (entity.segment) {
    const walk = await walkSegments({
      creds,
      entity,
      segment: entity.segment,
      keys: entity.segment.keys(context),
      start: decodePosition(cursor.lastKey),
      deadline,
      applyRows,
      onAdvance: (position) =>
        sapSyncCursorRepository.advance(
          tenantId,
          entity.key,
          encodePosition(position),
          passRowsNow(),
        ),
    });
    completed = walk.completed;
  } else {
    let lastKey = cursor.lastKey;

    for (;;) {
      const rows = await fetchPage(creds, entity, lastKey);

      if (rows.length === 0) {
        completed = true;
        break;
      }

      const endKey = pageEndKey(rows, entity);
      await applyRows(rows);
      lastKey = endKey;

      // Saved per page: an interrupted run loses one page of progress, never the pass.
      await sapSyncCursorRepository.advance(tenantId, entity.key, lastKey, passRowsNow());

      if (Date.now() >= deadline) break;
    }
  }

  const passRows = passRowsNow();
  const { fetched, pages, created, updated, unchanged } = totals;

  // Finishing a pass arms the next one. Nothing schedules it here — the next run finds no
  // pass in progress and starts one, which is also what makes a small entity's every run
  // a complete, fresh read.
  if (completed) {
    // A pass that read nothing at all is far likelier to be a broken filter or a renamed
    // UDF than an entity SAP emptied, and retiring on it would wipe the whole table.
    if (passRows === 0) {
      skips.add(
        `SAP returned no ${entity.noun.many} — nothing was removed from ISMS as a precaution`,
      );
    } else {
      removed = await entity.reconcile.retireUnseen(tenantId, passMark);
    }
    await sapSyncCursorRepository.completePass(tenantId, entity.key);
  }

  const result: SapSyncResult = {
    fetched,
    created,
    updated,
    unchanged,
    removed,
    skipped: skips.toList(),
    caughtUp: completed,
    passRows,
    totalAtSource: cursor.totalAtSource,
  };

  logger.info(
    {
      sync: entity.key,
      entity: entity.entity,
      tenantId,
      pages,
      fetched,
      created,
      updated,
      unchanged,
      removed,
      passRows,
      totalAtSource: cursor.totalAtSource,
      caughtUp: completed,
    },
    "sap sync slice finished",
  );

  await auditService.log({
    tenantId,
    userId: actorUserId ?? undefined,
    action: entity.audit.action,
    entityType: entity.audit.entityType,
    metadata: {
      sync: entity.key,
      entity: entity.entity,
      fetched,
      created,
      updated,
      unchanged,
      removed,
      skipped: result.skipped.reduce((sum, skip) => sum + skip.count, 0),
      passRows,
      caughtUp: completed,
    },
  });

  return result;
}

/**
 * Run one slice of `entity`'s sync for this tenant.
 *
 * Returns when the entity's pass completes or the time budget runs out, whichever comes
 * first; `caughtUp` says which. Small entities always come back caught up in one call, so
 * a caller that just wants "sync this now" can ignore the distinction. Callers that need
 * a large entity finished — the cron, the UI's Continue action — call again until
 * `caughtUp` is true.
 *
 * Locked per tenant and entity, so a second trigger (another tab, a refreshed page, a
 * cron slice overlapping a button press) joins the run already in flight instead of
 * pulling the same pages twice.
 */
export function runSapSync(
  tenantId: string,
  entity: SapSyncEntity,
  actorUserId: string | null,
  options?: { budgetMs?: number },
): Promise<SapSyncResult> {
  return withSapSyncLock(`${entity.key}:${tenantId}`, async () => {
    try {
      return await runSlice(tenantId, entity, actorUserId, options);
    } catch (e) {
      await sapSyncCursorRepository.recordError(
        tenantId,
        entity.key,
        e instanceof Error ? e.message : "Unknown error",
      );
      throw e;
    }
  });
}

/**
 * Re-sync only the rows of `entity` that `target` names: one serial, one model's serials,
 * the serials in one warehouse.
 *
 * It is a narrower read than a pass and deliberately *not* a pass. It never moves the
 * entity's cursor, so a pass in progress carries on from where it was; and it never
 * retires anything, because "SAP did not return row X for this target" says nothing about
 * whether X is gone from SAP. What it writes goes through the entity's own `parse` and
 * `applyPage`, so a targeted row ends up exactly as a pass would have left it.
 *
 * Rows it sees are stamped with the running pass's mark when there is one, so a pass that
 * already walked past them does not later treat them as unseen.
 *
 * Sliced like a pass: `caughtUp` false means the budget ran out, and `resume` is the place
 * to hand back on the next call. Locked per target, so a double click joins the run in
 * flight while two different targets still run side by side.
 */
export function runSapTargetedSync(
  tenantId: string,
  entity: SapSyncEntity,
  target: SapSyncTarget,
  actorUserId: string | null,
  options?: { budgetMs?: number; resume?: string | null },
): Promise<SapSyncResult> {
  return withSapSyncLock(`${entity.key}:target:${tenantId}:${target.label}`, () =>
    runTargetedSlice(tenantId, entity, target, actorUserId, options),
  );
}

async function runTargetedSlice(
  tenantId: string,
  entity: SapSyncEntity,
  target: SapSyncTarget,
  actorUserId: string | null,
  options?: { budgetMs?: number; resume?: string | null },
): Promise<SapSyncResult> {
  const creds = await requireCredentials(tenantId);
  const cursor = await sapSyncCursorRepository.get(tenantId, entity.key);
  const passMark = cursor.passStartedAt ?? new Date();

  const context = await entity.prepare?.(tenantId);
  const deadline = Date.now() + budgetMs(options?.budgetMs);
  const skips = new SkipTally();
  const { totals, applyRows } = createPageApplier(tenantId, entity, context, passMark, skips);
  const resume = decodeTargetedResume(options?.resume, entity.keyKind);

  let position = resume.position;
  const walk = await walkSegments({
    creds,
    entity,
    segment: target,
    keys: target.keys,
    start: resume.position,
    deadline,
    applyRows,
    onAdvance: async (next) => {
      position = next;
    },
  });
  position = walk.position;

  const passRows = resume.rows + totals.fetched;
  if (walk.completed && passRows === 0) {
    skips.add(`SAP returned no ${entity.noun.many} for this selection`);
  }

  const result: SapSyncResult = {
    fetched: totals.fetched,
    created: totals.created,
    updated: totals.updated,
    unchanged: totals.unchanged,
    removed: 0,
    skipped: skips.toList(),
    caughtUp: walk.completed,
    passRows,
    totalAtSource: null,
    resume: walk.completed ? null : encodeTargetedResume({ position, rows: passRows }),
  };

  logger.info(
    {
      sync: entity.key,
      entity: entity.entity,
      tenantId,
      target: target.label,
      pages: totals.pages,
      fetched: totals.fetched,
      created: totals.created,
      updated: totals.updated,
      unchanged: totals.unchanged,
      caughtUp: walk.completed,
    },
    "sap targeted sync slice finished",
  );

  await auditService.log({
    tenantId,
    userId: actorUserId ?? undefined,
    action: entity.audit.action,
    entityType: entity.audit.entityType,
    metadata: {
      sync: entity.key,
      entity: entity.entity,
      target: target.label,
      targetKeys: target.keys.length,
      fetched: totals.fetched,
      created: totals.created,
      updated: totals.updated,
      unchanged: totals.unchanged,
      skipped: result.skipped.reduce((sum, skip) => sum + skip.count, 0),
      caughtUp: walk.completed,
    },
  });

  return result;
}
