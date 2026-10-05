import type { SapChangeWatch } from "@prisma/client";

import { branchWarehouseSyncEntity } from "@/features/branches/services/branch-warehouse-sap-sync.service";
import { modelSyncEntity } from "@/features/master-data/services/model-sap-sync.service";
import { sapChangeCheckRepository } from "@/features/sap/repositories/sap-change-check.repository";
import { sapChangeWatchRepository } from "@/features/sap/repositories/sap-change-watch.repository";
import {
  compareLocations,
  compareModels,
  modelBrandKey,
  nextPendingSerials,
  type SapLocationRecord,
} from "@/features/sap/services/sap-change-compare";
import {
  sapDateLiteral,
  sapMaxKey,
  sapReadAll,
  type SapWalk,
} from "@/features/sap/services/sap-change-fetch";
import {
  notifySapChanges,
  type SapChangeOutcome,
  type SapChangeSet,
  type SapChangeTarget,
} from "@/features/sap/services/sap-change-notifier";
import { sapText } from "@/features/sap/services/sap-master-data";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";
import type { SapSyncEntity } from "@/features/sap/types/sap-sync-entity";
import { serialNumberSyncEntity } from "@/features/serial-numbers/services/serial-number-sap-sync.service";
import { serviceCenterSyncEntity } from "@/features/service-centers/services/service-center-sap-sync.service";
import { warehouseSyncEntity } from "@/features/warehouses/services/warehouse-sap-sync.service";
import { SAP_NO_CONNECTION_MESSAGE } from "@/config/platform";
import { logger } from "@/lib/shared/logger";

/**
 * The SAP auto-check: asks SAP, read-only, whether anything a Sync would bring into ISMS
 * has changed, and tells the users who can press that Sync. It never syncs and never
 * writes master data — syncing stays a deliberate, manual step.
 *
 * Each check reuses its sync descriptor's entity, `select`, `filter` and `parse`, then
 * compares with `sap-change-compare.ts`. The sync engine and descriptors are not modified.
 */

/** A module whose sync touched its cursor this recently with a pass open is mid-sync. */
const SYNC_IN_PROGRESS_MS = 15 * 60 * 1000;

/** Time one large-entity check (models, serials) may spend reading SAP per run. */
const LARGE_CHECK_BUDGET_MS = 60_000;

/** The `UpdateDate` window reaches this far before the last completed sync. */
const MODEL_WINDOW_OVERLAP_MS = 24 * 60 * 60 * 1000;

type SyncCursorRow = Awaited<
  ReturnType<typeof sapChangeCheckRepository.listSyncCursors>
>[number];

interface CheckContext {
  tenantId: string;
  creds: SapServiceLayerCredentials;
  watch: SapChangeWatch;
  cursor: SyncCursorRow | undefined;
}

interface CheckState {
  highKey?: string;
  pendingKeys?: string[];
}

type CheckFinding = { changes: SapChangeSet; state?: CheckState } | { skip: string; state?: CheckState };

interface SapChangeCheck {
  target: SapChangeTarget;
  /**
   * Serial numbers compare existence only, which a half-finished sync pass doesn't skew,
   * and their pass can stay open for days waiting on Continue — so they never wait.
   */
  checksMidPass?: boolean;
  find(context: CheckContext): Promise<CheckFinding>;
}

export type SapChangeCheckResult = {
  syncKey: string;
  outcome: SapChangeOutcome | "skipped" | "failed";
  detail?: string;
  counts?: { created: number; updated: number; removed: number };
};

function walkOf(entity: SapSyncEntity): SapWalk {
  return {
    entity: entity.entity,
    select: entity.select,
    filter: entity.filter,
    keyField: entity.keyField,
    keyKind: entity.keyKind,
  };
}

/** Rows the descriptor's own `parse` accepts; rows it skips the sync would skip too. */
function parseRecords<TRecord>(
  entity: SapSyncEntity<TRecord>,
  rows: Record<string, unknown>[],
): TRecord[] {
  const records: TRecord[] = [];
  for (const row of rows) {
    const parsed = entity.parse(row, undefined);
    if ("record" in parsed) records.push(parsed.record);
  }
  return records;
}

async function readLocations<TRecord>(
  creds: SapServiceLayerCredentials,
  entity: SapSyncEntity<TRecord>,
  toLocation: (record: TRecord) => SapLocationRecord,
): Promise<SapLocationRecord[]> {
  const { rows } = await sapReadAll(creds, walkOf(entity as SapSyncEntity));
  return parseRecords(entity, rows).map(toLocation);
}

/**
 * The syncs the auto-check watches. `branch` (SAP's separate OBRA branch list) is left
 * out: its Sync button is commented out on the Branches page, so a "press Sync" ping for
 * it could never be acted on or cleared. Add it here if that button comes back.
 */
export const SAP_CHANGE_CHECKS: SapChangeCheck[] = [
  {
    target: {
      syncKey: branchWarehouseSyncEntity.key,
      label: "Branches",
      permission: "branches.manage",
      href: "/settings/branches",
    },
    async find({ tenantId, creds }) {
      const sap = await readLocations(creds, branchWarehouseSyncEntity, (record) => ({
        code: record.sapCode,
        name: record.name,
        isInactive: record.isInactive,
      }));
      const isms = await sapChangeCheckRepository.listBranches(tenantId);
      return {
        changes: compareLocations(
          sap,
          isms.map((row) => ({
            code: row.sapCode,
            name: row.name,
            deletedAt: row.deletedAt,
            // Mirrors `retireUnseenSapBranches(…, claimsUnowned = true)`.
            retirable:
              row.sapSyncSource === branchWarehouseSyncEntity.key || row.sapSyncSource === null,
          })),
        ),
      };
    },
  },
  {
    target: {
      syncKey: warehouseSyncEntity.key,
      label: "Warehouses",
      permission: "warehouses.manage",
      href: "/settings/warehouses",
    },
    async find({ tenantId, creds }) {
      const sap = await readLocations(creds, warehouseSyncEntity, (record) => ({
        code: record.code,
        name: record.name,
        isInactive: record.isInactive,
      }));
      const isms = await sapChangeCheckRepository.listWarehouses(tenantId);
      return {
        changes: compareLocations(
          sap,
          isms.map((row) => ({ ...row, retirable: true })),
        ),
      };
    },
  },
  {
    target: {
      syncKey: serviceCenterSyncEntity.key,
      label: "Service centers",
      permission: "service_centers.manage",
      href: "/settings/service-centers",
    },
    async find({ tenantId, creds }) {
      // The filter only returns active cost centres, so nothing read here is inactive.
      const sap = await readLocations(creds, serviceCenterSyncEntity, (record) => ({
        code: record.sapCode,
        name: record.name,
        isInactive: false,
      }));
      const isms = await sapChangeCheckRepository.listServiceCenters(tenantId);
      return {
        changes: compareLocations(
          sap,
          isms.map((row) => ({
            code: row.sapCode,
            name: row.name,
            deletedAt: row.deletedAt,
            retirable: true,
          })),
        ),
      };
    },
  },
  {
    target: {
      syncKey: modelSyncEntity.key,
      label: "Models",
      permission: "master_data.manage",
      href: "/settings/master-data/models",
    },
    async find({ tenantId, creds, cursor }) {
      // Items is too large to read whole every few minutes; only it exposes UpdateDate.
      // The window starts at the last completed sync, so anything changed since is seen.
      if (!cursor?.lastCompletedAt) return { skip: "Models have not been synced yet" };
      const since = new Date(cursor.lastCompletedAt.getTime() - MODEL_WINDOW_OVERLAP_MS);

      // No brand filter here, unlike the sync: an item that lost its brand must be seen
      // to be reported as removed.
      const { rows } = await sapReadAll(
        creds,
        { ...walkOf(modelSyncEntity as SapSyncEntity), filter: `UpdateDate ge ${sapDateLiteral(since)}` },
        { deadline: Date.now() + LARGE_CHECK_BUDGET_MS },
      );

      const records = parseRecords(modelSyncEntity, rows);
      const unbranded = rows
        .filter((row) => !sapText(row.U_Brand) && sapText(row.ItemCode))
        .map((row) => sapText(row.ItemCode));

      const [isms, brands] = await Promise.all([
        sapChangeCheckRepository.findModels(tenantId, [
          ...records.map((record) => record.skuCode),
          ...unbranded,
        ]),
        sapChangeCheckRepository.listBrands(tenantId),
      ]);
      const brandIdByKey = new Map(brands.map((brand) => [modelBrandKey(brand.name), brand.id]));

      return { changes: compareModels(records, unbranded, isms, brandIdByKey) };
    },
  },
  {
    target: {
      syncKey: serialNumberSyncEntity.key,
      label: "Serial numbers",
      permission: "inventory.manage",
      href: "/inventory/serial-numbers",
    },
    checksMidPass: true,
    async find({ tenantId, creds, watch }) {
      const { entity, keyField } = serialNumberSyncEntity;

      // First run: remember where SAP is now and report nothing. Serials already in SAP
      // before the check existed are the sync's backlog, not news.
      if (watch.highKey === null) {
        const max = await sapMaxKey(creds, entity, keyField);
        return { skip: "Baseline recorded", state: { highKey: max ?? "0", pendingKeys: [] } };
      }

      const { rows } = await sapReadAll(
        creds,
        {
          entity,
          select: serialNumberSyncEntity.select,
          filter: `${keyField} gt ${watch.highKey}`,
          keyField,
          keyKind: "number",
        },
        { deadline: Date.now() + LARGE_CHECK_BUDGET_MS },
      );

      // Only serials of items ISMS holds — the same rule the serial sync's `parse` applies.
      const skus = await sapChangeCheckRepository.listModelSkus(tenantId);
      const newlySeen = rows
        .filter((row) => sapText(row.SerialNumber) && skus.has(sapText(row.ItemCode)))
        .map((row) => sapText(row.SerialNumber));

      const previous = Array.isArray(watch.pendingKeys)
        ? watch.pendingKeys.filter((key): key is string => typeof key === "string")
        : [];
      const live = await sapChangeCheckRepository.findLiveSerials(tenantId, [
        ...previous,
        ...newlySeen,
      ]);
      const { pending, capped } = nextPendingSerials(previous, newlySeen, live);

      const highKey = rows.length > 0 ? String(rows[rows.length - 1][keyField]) : watch.highKey;
      return {
        changes: { created: pending, updated: [], removed: [], createdCapped: capped },
        state: { highKey, pendingKeys: pending },
      };
    },
  },
];

/**
 * SAP itself is unreachable (down, network cut, timed out) rather than one entity failing.
 * Each such call can take the full request timeout, so after one the tenant's remaining
 * checks are skipped instead of waiting it out again for every sync.
 */
function isSapUnreachable(message: string): boolean {
  return /SAP did not respond|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(
    message,
  );
}

function syncInProgress(cursor: SyncCursorRow | undefined, now: number): boolean {
  return (
    cursor?.passStartedAt != null &&
    cursor.lastRunAt != null &&
    now - cursor.lastRunAt.getTime() < SYNC_IN_PROGRESS_MS
  );
}

/**
 * Check every watched sync for one tenant. One sync failing is recorded on its watch row
 * and logged; the rest still run.
 */
export async function runSapChangeCheck(tenantId: string): Promise<SapChangeCheckResult[]> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) throw new Error(SAP_NO_CONNECTION_MESSAGE);

  const cursors = await sapChangeCheckRepository.listSyncCursors(tenantId);
  const cursorByKey = new Map(cursors.map((cursor) => [cursor.entity, cursor]));
  const results: SapChangeCheckResult[] = [];
  let unreachable: string | null = null;

  for (const check of SAP_CHANGE_CHECKS) {
    const { syncKey } = check.target;
    const cursor = cursorByKey.get(syncKey);

    if (unreachable) {
      results.push({ syncKey, outcome: "skipped", detail: `SAP unreachable: ${unreachable}` });
      continue;
    }

    // ISMS is half-updated while a sync pass runs; comparing now would report noise.
    if (!check.checksMidPass && syncInProgress(cursor, Date.now())) {
      results.push({ syncKey, outcome: "skipped", detail: "Sync in progress" });
      continue;
    }

    try {
      const watch = await sapChangeWatchRepository.get(tenantId, syncKey);
      const finding = await check.find({ tenantId, creds, watch, cursor });

      if ("skip" in finding) {
        await sapChangeWatchRepository.recordCheck(tenantId, syncKey, finding.state);
        results.push({ syncKey, outcome: "skipped", detail: finding.skip });
        continue;
      }

      const outcome = await notifySapChanges({
        tenantId,
        target: check.target,
        watch,
        changes: finding.changes,
      });
      await sapChangeWatchRepository.recordCheck(tenantId, syncKey, finding.state);
      results.push({
        syncKey,
        outcome,
        counts: {
          created: finding.changes.created.length,
          updated: finding.changes.updated.length,
          removed: finding.changes.removed.length,
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      logger.error({ tenantId, syncKey, err: message }, "sap change check failed");
      await sapChangeWatchRepository.recordError(tenantId, syncKey, message).catch(() => {});
      results.push({ syncKey, outcome: "failed", detail: message });
      if (isSapUnreachable(message)) unreachable = message;
    }
  }

  return results;
}
