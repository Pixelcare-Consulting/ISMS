import { auditService } from "@/features/audit/services/audit.service";
import { sapSyncCursorRepository } from "@/features/sap/repositories/sap-sync-cursor.repository";
import type { SapSyncEntity } from "@/features/sap/types/sap-sync-entity";
import type { SapSyncResult, SapSyncSkip } from "@/features/sap/schemas/sap-master-sync.schema";
import {
  sapPageSize,
  sapErrorMessage,
  sapKeyLiteral,
} from "@/features/sap/services/sap-master-data";
import {
  decodePosition,
  encodePosition,
  planSegment,
  segmentClause,
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

async function runSlice(
  tenantId: string,
  entity: SapSyncEntity,
  actorUserId: string | null,
  options?: { budgetMs?: number },
): Promise<SapSyncResult> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) {
    throw new Error(SAP_NO_CONNECTION_MESSAGE);
  }

  let cursor = await sapSyncCursorRepository.get(tenantId, entity.entity);

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
      entity.entity,
      entity.segment ? null : await measureTotal(creds, entity),
    );
  }

  const context = await entity.prepare?.(tenantId);
  const deadline = Date.now() + budgetMs(options?.budgetMs);
  const skips = new SkipTally();

  let passRows = cursor.passRows;
  let fetched = 0;
  let pages = 0;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let completed = false;

  /** Parse and write one page, folding what it did into this run's totals. */
  async function applyRows(rows: Record<string, unknown>[]): Promise<void> {
    const records: unknown[] = [];
    for (const row of rows) {
      const parsed = entity.parse(row, context);
      if ("skip" in parsed) skips.add(parsed.skip, parsed.example);
      else records.push(parsed.record);
    }

    if (records.length > 0) {
      const applied = await entity.applyPage(tenantId, records);
      created += applied.created;
      updated += applied.updated;
      unchanged += applied.unchanged;
      for (const failure of applied.failures) skips.add(failure.reason, failure.example);
    }

    fetched += rows.length;
    passRows += rows.length;
    pages += 1;
  }

  if (entity.segment) {
    // Sorted and de-duplicated so segment boundaries fall in the same places on every run
    // of a pass — the cursor's anchor is only meaningful against a stable ordering. The
    // comparison is JavaScript's, never SAP's: segment membership is an explicit `or`
    // list, so unlike a `gt` walk this never depends on the company database's collation.
    const keys = [...new Set(entity.segment.keys(context))].sort();
    let position = decodePosition(cursor.lastKey);

    for (;;) {
      const plan = planSegment(keys, position.anchor, entity.segment);
      // No segment left to start: every key ISMS holds has been walked.
      if (!plan) {
        completed = true;
        break;
      }

      const rows = await fetchPage(
        creds,
        entity,
        position.lastKey,
        segmentClause(entity.segment, plan.keys),
      );

      if (rows.length === 0) {
        // This segment is exhausted; move to the next one, or finish the pass.
        if (plan.next === null) {
          completed = true;
          break;
        }
        position = { anchor: plan.next, lastKey: null };
      } else {
        const endKey = pageEndKey(rows, entity);
        await applyRows(rows);
        position = { anchor: plan.anchor, lastKey: endKey };
      }

      // Saved per page and per segment hop alike: an interrupted run loses one page of
      // progress, never the pass, and never its place in the key set.
      await sapSyncCursorRepository.advance(
        tenantId,
        entity.entity,
        encodePosition(position),
        passRows,
      );

      if (Date.now() >= deadline) break;
    }
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
      await sapSyncCursorRepository.advance(tenantId, entity.entity, lastKey, passRows);

      if (Date.now() >= deadline) break;
    }
  }

  // Finishing a pass arms the next one. Nothing schedules it here — the next run finds no
  // pass in progress and starts one, which is also what makes a small entity's every run
  // a complete, fresh read.
  if (completed) await sapSyncCursorRepository.completePass(tenantId, entity.entity);

  const result: SapSyncResult = {
    fetched,
    created,
    updated,
    unchanged,
    skipped: skips.toList(),
    caughtUp: completed,
    passRows,
    totalAtSource: cursor.totalAtSource,
  };

  logger.info(
    {
      entity: entity.entity,
      tenantId,
      pages,
      fetched,
      created,
      updated,
      unchanged,
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
      entity: entity.entity,
      fetched,
      created,
      updated,
      unchanged,
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
        entity.entity,
        e instanceof Error ? e.message : "Unknown error",
      );
      throw e;
    }
  });
}
