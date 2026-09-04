import { parseSapFlag, sapText } from "@/features/sap/services/sap-master-data";
import { runSapSync } from "@/features/sap/services/sap-sync-engine";
import {
  SAP_WAREHOUSE_TYPES,
  sapWarehouseTypeFilter,
} from "@/features/sap/services/sap-warehouse-type";
import type { SapSyncEntity } from "@/features/sap/types/sap-sync-entity";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { warehouseRepository } from "@/features/warehouses/repositories/warehouse.repository";

/**
 * Warehouse master data (OWHS) → ISMS warehouses, matched on `code`.
 *
 * SAP keeps branches, warehouses and service centres in one entity and tells them apart
 * only by `U_Warehouse_Type`, so this sync fetches the rows typed `Warehouse` and leaves
 * the other two types to their own syncs (`branch-from-warehouse`, `service-center`).
 * Each of the three filters server-side on its own type, so a row reaches exactly one of
 * them and no sync has to reason about types that are not its own.
 *
 * An untyped row therefore reaches none of them, and is imported nowhere until someone in
 * SAP types it — which is most of them today, since the UDF was added after the warehouses
 * were. That is deliberate: guessing would file a branch as a warehouse and give it stock
 * it should never hold. The backlog is not silent, it is just not this sync's job to
 * report — `scripts/check-sap-warehouse-type-udf.mjs` counts the untyped rows on demand.
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
  filter: sapWarehouseTypeFilter(SAP_WAREHOUSE_TYPES.warehouse),
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
