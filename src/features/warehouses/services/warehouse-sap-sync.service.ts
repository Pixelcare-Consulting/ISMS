import { parseSapFlag, sapText } from "@/features/sap/services/sap-master-data";
import { runSapSync } from "@/features/sap/services/sap-sync-engine";
import {
  SAP_WAREHOUSE_TYPES,
  SAP_WAREHOUSE_TYPE_FIELD,
  sapWarehouseType,
} from "@/features/sap/services/sap-warehouse-type";
import type { SapSyncEntity } from "@/features/sap/types/sap-sync-entity";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { warehouseRepository } from "@/features/warehouses/repositories/warehouse.repository";

/**
 * Warehouse master data (OWHS) → ISMS warehouses, matched on `code`.
 *
 * SAP keeps branches, warehouses and service centres in one entity and tells them apart
 * only by `U_Warehouse_Type`, so this sync takes the rows typed `Warehouse` and leaves the
 * other two types to their own syncs (`branch-from-warehouse`, `service-center`).
 *
 * Unlike those two, this one walks the entity *unfiltered* and skips what it cannot claim.
 * It is the incumbent — it used to import every warehouse regardless of type — so its skip
 * report is what shows where those rows went, and above all how many are still untyped.
 * Most of them are: the UDF was added after the warehouses were, and an untyped row
 * belongs to no module until someone in SAP says which. Reporting it beats guessing, which
 * would file a branch as a warehouse and give it stock it should never hold.
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
  select: `WarehouseCode,WarehouseName,Inactive,${SAP_WAREHOUSE_TYPE_FIELD}`,
  keyField: "WarehouseCode",
  keyKind: "string",

  audit: { action: "warehouse.sap_sync", entityType: "Warehouse" },

  parse(row) {
    const code = sapText(row.WarehouseCode);
    if (!code) return { skip: "SAP warehouse has no code" };

    const { raw, type } = sapWarehouseType(row);
    if (type === null) {
      return raw === null
        ? { skip: "Not typed in SAP — set its warehouse type to import it", example: code }
        : { skip: `Unrecognised SAP warehouse type "${raw}"`, example: code };
    }

    // Named per destination rather than a single "wrong type" reason: the report is read
    // to confirm a row landed *somewhere*, not just that this sync passed on it.
    if (type === SAP_WAREHOUSE_TYPES.branch) {
      return { skip: "Typed Branch in SAP — imported as a branch", example: code };
    }
    if (type === SAP_WAREHOUSE_TYPES.serviceCenter) {
      return {
        skip: "Typed Service Center in SAP — imported as a service centre",
        example: code,
      };
    }

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
