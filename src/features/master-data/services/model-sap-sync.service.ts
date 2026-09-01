import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { parseSapFlag, sapText } from "@/features/sap/services/sap-master-data";
import { runSapSync } from "@/features/sap/services/sap-sync-engine";
import type { SapSyncEntity } from "@/features/sap/types/sap-sync-entity";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import type { SkuStatus } from "@/lib/database/generated/prisma/client";

/**
 * Item master data (OITM) → ISMS product models, matched on `skuCode`.
 *
 * Syncs `description` (and `name`, which carries the same ItemName because the column is
 * NOT NULL) plus `status`. Brand, series, feature, resolution, size, SRP and CBM are
 * ISMS-only classifications with no SAP counterpart and are never touched — models
 * created by a sync land with them unset.
 *
 * Runs before serial numbers in the sync registry: a serial cannot be stored without its
 * model, so syncing items first is what lets the same cron pass link them.
 */

interface ModelRecord {
  skuCode: string;
  name: string;
  status: SkuStatus;
}

export const modelSyncEntity: SapSyncEntity<ModelRecord> = {
  key: "product-model",
  noun: { one: "model", many: "models" },

  entity: "Items",
  select: "ItemCode,ItemName,Valid,Frozen",
  keyField: "ItemCode",
  keyKind: "string",

  audit: { action: "product_model.sap_sync", entityType: "ProductModel" },

  parse(row) {
    // ItemCode is OITM's primary key and the only field matched on, so a row without one
    // cannot be placed. A blank ItemName is fine and is stored as blank.
    const skuCode = sapText(row.ItemCode);
    if (!skuCode) return { skip: "SAP item has no item code" };

    // `Valid` (item usable at all) and `Frozen` (blocked from transactions) both map to
    // `hold` — the ISMS status that keeps a model out of ordering and planogram pickers.
    // `retired` is never set by a sync; it stays a deliberate ISMS decision.
    const status: SkuStatus =
      parseSapFlag(row.Valid) && !parseSapFlag(row.Frozen) ? "active" : "hold";

    return { record: { skuCode, name: sapText(row.ItemName), status } };
  },

  applyPage(tenantId, records) {
    return masterDataRepository.applySapSyncPage(tenantId, records);
  },
};

export const modelSapSyncService = {
  /** Pull item master data from SAP and upsert ISMS product models. */
  syncFromSap(
    tenantId: string,
    actorUserId: string | null,
    options?: { budgetMs?: number },
  ): Promise<SapSyncResult> {
    return runSapSync(tenantId, modelSyncEntity, actorUserId, options);
  },
};
