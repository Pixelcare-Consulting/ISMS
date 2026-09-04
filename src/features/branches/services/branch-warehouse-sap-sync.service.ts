import { branchRepository } from "@/features/branches/repositories/branch.repository";
import { sapText } from "@/features/sap/services/sap-master-data";
import { runSapSync } from "@/features/sap/services/sap-sync-engine";
import {
  SAP_WAREHOUSE_TYPES,
  SAP_WAREHOUSE_TYPE_FIELD,
  sapWarehouseTypeFilter,
} from "@/features/sap/services/sap-warehouse-type";
import type { SapSyncEntity } from "@/features/sap/types/sap-sync-entity";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";

/**
 * Warehouse master data (OWHS) typed `Branch` → ISMS branches, matched on `sapCode`.
 *
 * A retail branch is a stock location in SAP, so it lives in `Warehouses` like any other
 * and is marked a branch only by `U_Warehouse_Type`. That makes this the second source of
 * ISMS branches, alongside `branch-sap-sync.service.ts`, which reads SAP's multi-branch
 * feature (OBRA). The two do not overlap or fight: they key on different namespaces —
 * warehouse codes here (`ABB001`), OBRA's own numeric codes there (`1`, `2`) — so each
 * only ever creates and updates its own rows.
 *
 * Filtered server-side, unlike the warehouse sync, which walks the entity whole to report
 * what is still untyped. A branch-typed row is unambiguous, so there is nothing to report:
 * fetching only the matches keeps this sync's skip list about genuine problems rather than
 * about the ~1,300 rows that were never branches.
 *
 * Syncs `name` only. Area, dealer, primary warehouse and the rest are ISMS-only
 * classifications with no SAP counterpart; a branch created here lands with them unset and
 * a later sync never touches them. Status is left alone for the same reason the OBRA sync
 * leaves it alone — see `applySapSyncPage`.
 */

interface BranchRecord {
  sapCode: string;
  name: string;
}

export const branchWarehouseSyncEntity: SapSyncEntity<BranchRecord> = {
  key: "branch-from-warehouse",
  noun: { one: "branch", many: "branches" },

  entity: "Warehouses",
  select: `WarehouseCode,WarehouseName,${SAP_WAREHOUSE_TYPE_FIELD}`,
  filter: sapWarehouseTypeFilter(SAP_WAREHOUSE_TYPES.branch),
  keyField: "WarehouseCode",
  keyKind: "string",

  audit: { action: "branch.sap_sync", entityType: "Branch" },

  parse(row) {
    const sapCode = sapText(row.WarehouseCode);
    if (!sapCode) return { skip: "SAP branch has no warehouse code" };

    const name = sapText(row.WarehouseName);
    if (!name) return { skip: "SAP branch has no name", example: sapCode };

    return { record: { sapCode, name } };
  },

  applyPage(tenantId, records) {
    return branchRepository.applySapSyncPage(tenantId, records);
  },
};

export const branchWarehouseSapSyncService = {
  /** Pull SAP warehouses typed `Branch` and upsert ISMS branches. */
  syncFromSap(
    tenantId: string,
    actorUserId: string | null,
    options?: { budgetMs?: number },
  ): Promise<SapSyncResult> {
    return runSapSync(tenantId, branchWarehouseSyncEntity, actorUserId, options);
  },
};
