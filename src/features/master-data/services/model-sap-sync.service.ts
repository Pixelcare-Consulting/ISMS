import { auditService } from "@/features/audit/services/audit.service";
import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import type {
  SapMasterSyncResult,
  SapMasterSyncSkip,
} from "@/features/sap/schemas/sap-master-sync.schema";
import {
  fetchSapCollection,
  parseSapFlag,
} from "@/features/sap/services/sap-master-data";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { withSapSyncLock } from "@/features/sap/services/sap-sync-lock";
import type { SkuStatus } from "@/lib/database/generated/prisma/client";

/** SAP B1 Service Layer entity holding item master data (OITM). */
const SAP_ITEM_ENTITY = "Items";
const SAP_ITEM_SELECT = "ItemCode,ItemName,Valid,Frozen";
const SAP_ITEM_ORDER_BY = "ItemCode";

interface SapItemRecord {
  ItemCode?: string | null;
  ItemName?: string | null;
  Valid?: boolean | string | null;
  Frozen?: boolean | string | null;
}

/**
 * `Valid` (item usable at all) and `Frozen` (blocked from transactions) both map to
 * `hold` — the ISMS status that keeps a model out of ordering and planogram pickers.
 * `retired` is never set by sync; it stays a deliberate ISMS decision.
 */
function readSapRecord(record: SapItemRecord) {
  const isValid = parseSapFlag(record.Valid);
  const isFrozen = parseSapFlag(record.Frozen);
  const status: SkuStatus = isValid && !isFrozen ? "active" : "hold";
  return {
    skuCode: (record.ItemCode ?? "").trim(),
    // Stored exactly as SAP has it, blanks included — SAP is the source of truth.
    itemName: (record.ItemName ?? "").trim(),
    status,
  };
}

async function runSync(tenantId: string, actorUserId: string): Promise<SapMasterSyncResult> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) {
    throw new Error(
      "No active SAP Service Layer connection. Enable one under Settings → SAP Integration → Service Layer.",
    );
  }

  const records = await fetchSapCollection<SapItemRecord>(creds, {
    entity: SAP_ITEM_ENTITY,
    select: SAP_ITEM_SELECT,
    orderBy: SAP_ITEM_ORDER_BY,
  });
  const existing = await masterDataRepository.listSapSyncSnapshot(tenantId);
  const bySkuCode = new Map(existing.map((model) => [model.skuCode, model]));

  const skipped: SapMasterSyncSkip[] = [];
  const toCreate: { skuCode: string; name: string; description: string; status: SkuStatus }[] = [];
  const toUpdate: {
    id: string;
    skuCode: string;
    name: string;
    description: string;
    status: SkuStatus;
  }[] = [];
  const seen = new Set<string>();
  let unchanged = 0;

  for (const record of records) {
    const { skuCode, itemName, status } = readSapRecord(record);

    // ItemCode is OITM's primary key and the only field we match on, so a row without
    // one cannot be placed. A blank ItemName is fine and is stored as blank.
    if (!skuCode) {
      skipped.push({ sapCode: null, name: itemName || null, reason: "Missing item code" });
      continue;
    }
    // `seen` drives both dedupe and `notInSap`, so a code SAP actually returned has to
    // register here even if the row is skipped below — otherwise the model gets
    // reported as "no matching SAP record" when SAP does know about it.
    if (seen.has(skuCode)) {
      skipped.push({ sapCode: skuCode, name: itemName, reason: "Duplicate item code in SAP response" });
      continue;
    }
    seen.add(skuCode);

    const match = bySkuCode.get(skuCode);
    if (!match) {
      toCreate.push({ skuCode, name: itemName, description: itemName, status });
      continue;
    }
    if (match.name === itemName && match.description === itemName && match.status === status) {
      unchanged += 1;
      continue;
    }
    toUpdate.push({ id: match.id, skuCode, name: itemName, description: itemName, status });
  }

  const applied = await masterDataRepository.applySapSync(tenantId, {
    create: toCreate,
    update: toUpdate,
  });
  for (const failure of applied.failures) {
    skipped.push({ sapCode: failure.sapCode, name: failure.name, reason: failure.reason });
  }

  const result: SapMasterSyncResult = {
    fetched: records.length,
    created: applied.created,
    updated: applied.updated,
    unchanged,
    skipped,
    // Expected to be 0: with manual creation disabled, every model comes from a sync.
    // Reported only — nothing is ever removed.
    notInSap: existing.filter((model) => !seen.has(model.skuCode)).length,
  };

  await auditService.log({
    tenantId,
    userId: actorUserId,
    action: "product_model.sap_sync",
    entityType: "ProductModel",
    metadata: {
      entity: SAP_ITEM_ENTITY,
      fetched: result.fetched,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      skipped: result.skipped.length,
      notInSap: result.notInSap,
    },
  });

  return result;
}

export const modelSapSyncService = {
  /**
   * Pull item master data from SAP and upsert ISMS product models matched on `skuCode`.
   *
   * Syncs `description` (and `name`, which carries the same ItemName because the column
   * is NOT NULL) plus `status`. Brand, series, feature, resolution, size, SRP and CBM
   * are ISMS-only classifications with no SAP counterpart and are never touched — models
   * created by sync land with them unset.
   *
   * Locked per tenant so concurrent triggers join one run instead of hitting SAP twice.
   */
  syncFromSap(tenantId: string, actorUserId: string): Promise<SapMasterSyncResult> {
    return withSapSyncLock(`product-model:${tenantId}`, () => runSync(tenantId, actorUserId));
  },
};
