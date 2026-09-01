import { branchSyncEntity } from "@/features/branches/services/branch-sap-sync.service";
import { dealerSyncEntity } from "@/features/dealers/services/dealer-sap-sync.service";
import { modelSyncEntity } from "@/features/master-data/services/model-sap-sync.service";
import { serialNumberSyncEntity } from "@/features/serial-numbers/services/serial-number-sap-sync.service";
import { warehouseSyncEntity } from "@/features/warehouses/services/warehouse-sap-sync.service";
import type { SapSyncEntity } from "@/features/sap/types/sap-sync-entity";

/**
 * Every SAP → ISMS master-data sync, in the order a scheduled run should work through
 * them.
 *
 * The order is a dependency order, not a preference: a serial number cannot be stored
 * without its product model, so `Items` is read before `SerialNumberDetails` and a serial
 * whose model is new can link in the same run. The four small entities run first anyway —
 * together they are a few seconds against the serials' several minutes.
 */
export const SAP_SYNC_ENTITIES: SapSyncEntity[] = [
  branchSyncEntity,
  warehouseSyncEntity,
  dealerSyncEntity,
  modelSyncEntity,
  serialNumberSyncEntity,
];
