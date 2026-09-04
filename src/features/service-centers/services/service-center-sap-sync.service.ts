import { sapText } from "@/features/sap/services/sap-master-data";
import { runSapSync } from "@/features/sap/services/sap-sync-engine";
import {
  SAP_WAREHOUSE_TYPES,
  sapWarehouseTypeFilter,
} from "@/features/sap/services/sap-warehouse-type";
import { serviceCenterRepository } from "@/features/service-centers/repositories/service-center.repository";
import type { SapSyncEntity } from "@/features/sap/types/sap-sync-entity";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";

/**
 * Warehouse master data (OWHS) typed `Service Center` → ISMS service centres, matched on
 * `sapCode`.
 *
 * A service centre holds stock, so SAP models it as a warehouse and marks it one only by
 * `U_Warehouse_Type`. Filtered server-side on that type, as the branch and warehouse syncs
 * are on theirs, so a row reaches exactly one of the three.
 *
 * Syncs `name` only. Area, dealer type, dealer area and mode of payment are ISMS-only
 * classifications with no SAP counterpart, so a service centre created here lands with
 * them unset and a later sync never touches them. Status is ISMS-managed too: a new row
 * lands `active`, and updates leave status alone rather than reviving something an admin
 * deactivated on purpose. Locations are out of scope — SAP models those as `BinLocations`.
 *
 * No rows carry this type in the company database yet; the sync simply reports nothing to
 * do until SAP starts typing them.
 */

interface ServiceCenterRecord {
  sapCode: string;
  name: string;
}

export const serviceCenterSyncEntity: SapSyncEntity<ServiceCenterRecord> = {
  key: "service-center",
  noun: { one: "service centre", many: "service centres" },

  entity: "Warehouses",
  select: "WarehouseCode,WarehouseName",
  filter: sapWarehouseTypeFilter(SAP_WAREHOUSE_TYPES.serviceCenter),
  keyField: "WarehouseCode",
  keyKind: "string",

  audit: { action: "service_center.sap_sync", entityType: "ServiceCenter" },

  parse(row) {
    const sapCode = sapText(row.WarehouseCode);
    if (!sapCode) return { skip: "SAP service centre has no warehouse code" };

    const name = sapText(row.WarehouseName);
    if (!name) return { skip: "SAP service centre has no name", example: sapCode };

    return { record: { sapCode, name } };
  },

  applyPage(tenantId, records) {
    return serviceCenterRepository.applySapSyncPage(tenantId, records);
  },
};

export const serviceCenterSapSyncService = {
  /** Pull SAP warehouses typed `Service Center` and upsert ISMS service centres. */
  syncFromSap(
    tenantId: string,
    actorUserId: string | null,
    options?: { budgetMs?: number },
  ): Promise<SapSyncResult> {
    return runSapSync(tenantId, serviceCenterSyncEntity, actorUserId, options);
  },
};
