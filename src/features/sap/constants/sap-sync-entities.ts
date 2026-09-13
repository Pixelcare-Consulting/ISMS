import { branchSyncEntity } from "@/features/branches/services/branch-sap-sync.service";
import { branchWarehouseSyncEntity } from "@/features/branches/services/branch-warehouse-sap-sync.service";
import { modelSyncEntity } from "@/features/master-data/services/model-sap-sync.service";
import { serialNumberSyncEntity } from "@/features/serial-numbers/services/serial-number-sap-sync.service";
import { serviceCenterSyncEntity } from "@/features/service-centers/services/service-center-sap-sync.service";
import { warehouseSyncEntity } from "@/features/warehouses/services/warehouse-sap-sync.service";
import type { SapSyncEntity } from "@/features/sap/types/sap-sync-entity";

/**
 * Every SAP → ISMS master-data sync, in the order a scheduled run should work through
 * them.
 *
 * The order is a dependency order, not a preference: a serial number cannot be stored
 * without its product model, so `Items` is read before `SerialNumberDetails` and a serial
 * whose model is new can link in the same run. The small entities run first anyway —
 * together they are a few seconds against the serials' several minutes.
 *
 * Three of them read the same entity: SAP keeps branches and warehouses in `Warehouses`
 * and tells them apart by `U_Warehouse_Type`. They are still separate syncs because they
 * write separate tables and each keeps its own place in the entity — see
 * `sap-warehouse-type.ts`. Service centres come from the cost centre master instead.
 *
 * Dealers are not synced: they are ISMS-managed (added by hand or imported).
 */
export const SAP_SYNC_ENTITIES: SapSyncEntity[] = [
  branchSyncEntity,
  branchWarehouseSyncEntity,
  warehouseSyncEntity,
  serviceCenterSyncEntity,
  modelSyncEntity,
  serialNumberSyncEntity,
];
