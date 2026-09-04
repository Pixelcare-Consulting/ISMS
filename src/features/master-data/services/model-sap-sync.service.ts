import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { parseSapFlag, sapText } from "@/features/sap/services/sap-master-data";
import { runSapSync } from "@/features/sap/services/sap-sync-engine";
import type { SapSyncEntity } from "@/features/sap/types/sap-sync-entity";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import type { SkuStatus } from "@/lib/database/generated/prisma/client";

/**
 * Item master data (OITM) → ISMS product models, matched on `skuCode`.
 *
 * Branded items only: `U_Brand` is the item Brand UDF, and the filter below keeps rows
 * that have a value for it. An item SAP has not classified has no place in ISMS ordering
 * or planogram pickers, so it is never fetched — and one that loses its brand in SAP
 * simply stops coming back, exactly like an inactive dealer.
 *
 * Syncs `description` (and `name`, which carries the same ItemName because the column is
 * NOT NULL), `status` and `brand`. Series, feature, resolution, size, SRP and CBM are
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
  /** The `U_Brand` value as SAP wrote it; the repository resolves it to a `Brand` row. */
  brandName: string;
}

export const modelSyncEntity: SapSyncEntity<ModelRecord> = {
  key: "product-model",
  noun: { one: "model", many: "models" },

  entity: "Items",
  select: "ItemCode,ItemName,Valid,Frozen,U_Brand",
  /**
   * Both halves are needed: items that predate the UDF hold NULL, items saved since it
   * was added but left blank hold an empty string, and neither is a brand.
   */
  filter: "U_Brand ne null and U_Brand ne ''",
  keyField: "ItemCode",
  keyKind: "string",

  audit: { action: "product_model.sap_sync", entityType: "ProductModel" },

  parse(row) {
    // ItemCode is OITM's primary key and the only field matched on, so a row without one
    // cannot be placed. A blank ItemName is fine and is stored as blank.
    const skuCode = sapText(row.ItemCode);
    if (!skuCode) return { skip: "SAP item has no item code" };

    // The `filter` above already restricts the fetch to branded items; this catches the
    // whitespace-only value that satisfies `ne ''` on SAP's side but names no brand.
    const brandName = sapText(row.U_Brand);
    if (!brandName) return { skip: "SAP item has no brand", example: skuCode };

    // `Valid` (item usable at all) and `Frozen` (blocked from transactions) both map to
    // `hold` — the ISMS status that keeps a model out of ordering and planogram pickers.
    // `retired` is never set by a sync; it stays a deliberate ISMS decision.
    const status: SkuStatus =
      parseSapFlag(row.Valid) && !parseSapFlag(row.Frozen) ? "active" : "hold";

    return { record: { skuCode, name: sapText(row.ItemName), status, brandName } };
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
