import { parseSapFlag, sapText } from "@/features/sap/services/sap-master-data";
import { runSapSync } from "@/features/sap/services/sap-sync-engine";
import type { SapSyncEntity } from "@/features/sap/types/sap-sync-entity";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { warehouseRepository } from "@/features/warehouses/repositories/warehouse.repository";

/**
 * Warehouse master data (OWHS) → ISMS warehouses, matched on `code`.
 *
 * Only `name` is synced. `isMain` is an ISMS-only concept with no SAP counterpart, so it
 * is never touched — new warehouses land with the schema default (false) and an admin
 * picks the main one. Warehouse locations (bins) are out of scope; SAP models those as
 * `BinLocations`, a separate entity.
 */

interface WarehouseRecord {
  code: string;
  name: string;
  /** Passed through rather than acted on here — see `applySapSyncPage`. */
  isInactive: boolean;
}

export const warehouseSyncEntity: SapSyncEntity<WarehouseRecord> = {
  key: "warehouse",
  noun: { one: "warehouse", many: "warehouses" },

  entity: "Warehouses",
  select: "WarehouseCode,WarehouseName,Inactive",
  keyField: "WarehouseCode",
  keyKind: "string",

  audit: { action: "warehouse.sap_sync", entityType: "Warehouse" },

  parse(row) {
    const code = sapText(row.WarehouseCode);
    if (!code) return { skip: "SAP warehouse has no code" };

    const name = sapText(row.WarehouseName);
    if (!name) return { skip: "SAP warehouse has no name", example: code };

    return { record: { code, name, isInactive: parseSapFlag(row.Inactive) } };
  },

  applyPage(tenantId, records) {
    return warehouseRepository.applySapSyncPage(tenantId, records);
  },
};

export const warehouseSapSyncService = {
  /** Pull warehouse master data from SAP and upsert ISMS warehouses. */
  syncFromSap(
    tenantId: string,
    actorUserId: string | null,
    options?: { budgetMs?: number },
  ): Promise<SapSyncResult> {
    return runSapSync(tenantId, warehouseSyncEntity, actorUserId, options);
  },
};
