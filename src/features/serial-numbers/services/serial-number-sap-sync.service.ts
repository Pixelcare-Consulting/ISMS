import { auditService } from "@/features/audit/services/audit.service";
import type { SapMasterSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { sapSyncCursorRepository } from "@/features/sap/repositories/sap-sync-cursor.repository";
import { streamSapCollection } from "@/features/sap/services/sap-master-data";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { withSapSyncLock } from "@/features/sap/services/sap-sync-lock";
import { serialNumberRepository } from "@/features/serial-numbers/repositories/serial-number.repository";
import { logger } from "@/lib/shared/logger";

/**
 * SAP B1 Service Layer entity holding serial number master data (OSRN) — the counterpart
 * of `BatchNumberDetails` for batches. OSRN's own column names are not the entity set's:
 * `SerialNumbers` is not a resource path and answers "Unrecognized resource path".
 */
const SAP_SERIAL_ENTITY = "SerialNumberDetails";
/**
 * `SerialNumber` is what the Service Layer calls OSRN.DistNumber, the serial the
 * integration mapping specifies. Deliberately not `MfrSerialNo` (OSRN.MnfSerial): that is
 * a different value and would not match the serials the PSG import already carries.
 */
const SAP_SERIAL_SELECT = "DocEntry,SerialNumber,ItemCode";
/** The entity key: monotonic, dense, and what the watermark is expressed in. */
const SAP_SERIAL_KEY = "DocEntry";

/**
 * How long one run may spend reading SAP before it stops and saves its place.
 *
 * This entity is millions of rows — far more than any single request can read — so a run
 * is a bounded slice of the work, not the whole of it. The default leaves headroom under
 * a 300s function timeout for the final page's writes and the audit record.
 */
const DEFAULT_BUDGET_MS = 240_000;

function budgetMs(override?: number): number {
  if (override && override > 0) return override;
  const raw = Number.parseInt(process.env.SAP_SYNC_BUDGET_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_BUDGET_MS;
}

interface SapSerialRecord {
  DocEntry?: number | null;
  SerialNumber?: string | null;
  ItemCode?: string | null;
}

export interface SerialSyncProgress extends SapMasterSyncResult {
  /** Watermark this run finished at, in DocEntry terms. */
  cursor: number;
  /** SAP's row count when last measured, or null if never measured. */
  totalAtSource: number | null;
  /** False when the run stopped on its budget with rows still unread. */
  caughtUp: boolean;
  /**
   * Serials this run could not link because their item is not in ISMS. Surfaced on its
   * own rather than buried in `skipped` so the UI can tell the user the one thing that
   * fixes it: sync Models first.
   */
  missingModels: number;
  /** Distinct SAP item codes behind `missingModels`, capped for display. */
  missingModelCodes: string[];
}

/** Item codes listed back to the user when their models are missing. */
const MAX_REPORTED_ITEM_CODES = 20;

/**
 * SAP's total row count, measured once per entity and cached on the cursor.
 *
 * `$count` on this entity takes 15-20s, so it is not worth paying on every incremental
 * run — it exists to give the backfill a denominator. A stale value is fine: it is only
 * ever used to report progress.
 */
async function ensureTotal(
  tenantId: string,
  creds: Parameters<typeof streamSapCollection>[0],
  known: number | null,
): Promise<number | null> {
  if (known !== null) return known;
  try {
    const response = await sapServiceLayerClient.request({
      creds,
      method: "GET",
      path: `/${SAP_SERIAL_ENTITY}/$count`,
    });
    const total = Number.parseInt((response.rawBody ?? "").trim(), 10);
    if (!Number.isFinite(total)) return null;
    await sapSyncCursorRepository.setTotalAtSource(tenantId, SAP_SERIAL_ENTITY, total);
    return total;
  } catch {
    // Progress reporting is not worth failing a sync over.
    return null;
  }
}

async function runSync(
  tenantId: string,
  /** Null for scheduled runs — `AuditLog.userId` is nullable and means "not a person". */
  actorUserId: string | null,
  options?: { budgetMs?: number },
): Promise<SerialSyncProgress> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) {
    throw new Error(
      "No active SAP Service Layer connection. Enable one under Settings → SAP Integration → Service Layer.",
    );
  }

  // `SerialNumber.modelId` is a required FK, so a serial cannot be stored until its item
  // exists in ISMS. Models number in the thousands, so this map is cheap to hold for the
  // whole run — unlike the serials themselves.
  //
  // Checked before anything expensive: with no models at all, every row SAP returns is
  // unusable, and reading them would burn the row count and a full budget of paging to
  // arrive at a conclusion already known here.
  const models = await serialNumberRepository.listModelOptions(tenantId);
  if (models.length === 0) {
    throw new Error(
      "No product models in ISMS yet. Serial numbers link to a model, so sync Models " +
        "from SAP first (Settings → Master Data → Models), then run this again.",
    );
  }
  const modelIdBySku = new Map(models.map((model) => [model.skuCode, model.id]));

  let cursor = await sapSyncCursorRepository.get(tenantId, SAP_SERIAL_ENTITY);

  // The watermark only ever reads forward, so it is worthless if the rows it claims to
  // have applied are gone — every later run would report "nothing new" while the table
  // stayed permanently short. Deleting a model cascades to its serials, so this is a
  // real way to end up here, not a hypothetical one.
  //
  // Only the unambiguous case is acted on: a cursor claiming progress with no serials at
  // all. A partial shortfall is indistinguishable from rows legitimately skipped for a
  // missing model, so it is left alone rather than guessed at.
  if (cursor.lastKey > 0 && !(await serialNumberRepository.hasAny(tenantId))) {
    logger.warn(
      { tenantId, entity: SAP_SERIAL_ENTITY, lastKey: cursor.lastKey },
      "sap serial cursor is ahead of an empty table — resetting to re-read from the start",
    );
    await sapSyncCursorRepository.reset(tenantId, SAP_SERIAL_ENTITY);
    cursor = await sapSyncCursorRepository.get(tenantId, SAP_SERIAL_ENTITY);
  }

  const totalAtSource = await ensureTotal(tenantId, creds, cursor.totalAtSource);

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let missingModels = 0;
  let missingSerialNo = 0;
  const missingModelCodes = new Set<string>();
  /** Lowest key skipped for a missing model, so it can be re-read once one exists. */
  let pendingFromKey: number | null = null;
  let watermark = cursor.lastKey;
  const failures = new Map<string, number>();

  const outcome = await streamSapCollection<SapSerialRecord>(
    creds,
    {
      entity: SAP_SERIAL_ENTITY,
      select: SAP_SERIAL_SELECT,
      orderBy: SAP_SERIAL_KEY,
      // The watermark is the whole reason a four-million-row entity is syncable: every
      // run after the first reads only what SAP has added since.
      filter: cursor.lastKey > 0 ? `${SAP_SERIAL_KEY} gt ${cursor.lastKey}` : undefined,
    },
    async ({ rows }) => {
      const wanted = new Map<string, { serialNo: string; modelId: string }>();
      let pageMax = watermark;

      for (const record of rows) {
        const docEntry = typeof record.DocEntry === "number" ? record.DocEntry : null;
        if (docEntry !== null && docEntry > pageMax) pageMax = docEntry;

        const serialNo = (record.SerialNumber ?? "").trim();
        const itemCode = (record.ItemCode ?? "").trim();

        if (!serialNo) {
          missingSerialNo += 1;
          continue;
        }
        const modelId = itemCode ? modelIdBySku.get(itemCode) : undefined;
        if (!modelId) {
          missingModels += 1;
          // Bounded: one bad catalogue could otherwise collect thousands of codes.
          if (itemCode && missingModelCodes.size < MAX_REPORTED_ITEM_CODES) {
            missingModelCodes.add(itemCode);
          }
          // Remembered rather than lost: the watermark is about to move past this row,
          // so without this it could never be picked up once its model arrives.
          if (docEntry !== null && (pendingFromKey === null || docEntry < pendingFromKey)) {
            pendingFromKey = docEntry;
          }
          continue;
        }
        // SAP keys serials per item, so one serial can appear under two items within a
        // page. ISMS is unique on serialNo alone, so the first occurrence wins.
        if (!wanted.has(serialNo)) wanted.set(serialNo, { serialNo, modelId });
      }

      if (wanted.size > 0) {
        const applied = await serialNumberRepository.applySapSyncPage(tenantId, [...wanted.values()]);
        created += applied.created;
        updated += applied.updated;
        unchanged += applied.unchanged;
        for (const failure of applied.failures) {
          failures.set(failure.reason, (failures.get(failure.reason) ?? 0) + 1);
        }
      }

      // Persisted per page, so an interrupted run loses at most one page of progress
      // rather than restarting a multi-million-row read.
      if (pageMax > watermark) {
        watermark = pageMax;
        await sapSyncCursorRepository.advance(tenantId, SAP_SERIAL_ENTITY, watermark);
      }
    },
    { budgetMs: budgetMs(options?.budgetMs) },
  );

  if (pendingFromKey !== null) {
    await sapSyncCursorRepository.recordPending(
      tenantId,
      SAP_SERIAL_ENTITY,
      pendingFromKey,
      models.length,
    );
  }

  // Reaching the end does not always mean finished: if rows were skipped for missing
  // models and models have arrived since, the cursor rewinds for another pass.
  const settled = outcome.completed
    ? !(await sapSyncCursorRepository.markCaughtUp(tenantId, SAP_SERIAL_ENTITY, models.length))
        .rewound
    : false;

  const skipped = [
    ...(missingModels > 0
      ? [
          {
            sapCode: null,
            name: null,
            reason: `${missingModels} serials skipped — their item is not in ISMS. Sync Models from SAP, then run this again.`,
          },
        ]
      : []),
    ...(missingSerialNo > 0
      ? [{ sapCode: null, name: null, reason: `${missingSerialNo} SAP rows had no serial number` }]
      : []),
    // Write failures are grouped by reason: at this volume a per-row list is unreadable
    // and a systemic problem reports as one line.
    ...[...failures.entries()].map(([reason, count]) => ({
      sapCode: null,
      name: null,
      reason: `${count} could not be saved — ${reason}`,
    })),
  ];

  const result: SerialSyncProgress = {
    fetched: outcome.rows,
    created,
    updated,
    unchanged,
    skipped,
    // Not computable without loading every ISMS serial, which is the thing this rewrite
    // exists to avoid. Serials are never removed by sync regardless.
    notInSap: 0,
    cursor: watermark,
    totalAtSource,
    caughtUp: settled,
    missingModels,
    missingModelCodes: [...missingModelCodes],
  };

  logger.info(
    {
      entity: SAP_SERIAL_ENTITY,
      pages: outcome.pages,
      fetched: result.fetched,
      created,
      updated,
      missingModels,
      cursor: watermark,
      caughtUp: settled,
    },
    "sap serial sync slice finished",
  );

  await auditService.log({
    tenantId,
    userId: actorUserId ?? undefined,
    action: "serial_number.sap_sync",
    entityType: "SerialNumber",
    metadata: {
      entity: SAP_SERIAL_ENTITY,
      fetched: result.fetched,
      created,
      updated,
      unchanged,
      missingModels,
      cursor: watermark,
      totalAtSource,
      caughtUp: settled,
    },
  });

  return result;
}

export const serialNumberSapSyncService = {
  /**
   * Pull serial master data from SAP, resuming from the watermark this entity last
   * reached and stopping when the run's time budget is spent.
   *
   * One call is a slice of work, not necessarily the whole entity: `caughtUp` says
   * whether SAP has more. The first backfill of a large company takes several slices;
   * every run after that is a short incremental read. Call it repeatedly (the cron route
   * does) until `caughtUp` is true.
   *
   * Registry only — no inventory is created. A synced serial exists with no branch or
   * warehouse location until something in ISMS places it.
   */
  syncFromSap(
    tenantId: string,
    actorUserId: string | null,
    options?: { budgetMs?: number },
  ): Promise<SerialSyncProgress> {
    return withSapSyncLock(`serial-number:${tenantId}`, async () => {
      try {
        return await runSync(tenantId, actorUserId, options);
      } catch (e) {
        await sapSyncCursorRepository.recordError(
          tenantId,
          SAP_SERIAL_ENTITY,
          e instanceof Error ? e.message : "Unknown error",
        );
        throw e;
      }
    });
  },
};
