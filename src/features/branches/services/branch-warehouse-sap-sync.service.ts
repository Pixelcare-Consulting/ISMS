import { branchRepository } from "@/features/branches/repositories/branch.repository";
import { parseSapFlag, sapText } from "@/features/sap/services/sap-master-data";
import { runSapSync } from "@/features/sap/services/sap-sync-engine";
import {
  SAP_WAREHOUSE_TYPES,
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
 * Filtered server-side on the type, as the warehouse and service-centre syncs are on
 * theirs: a row reaches exactly one of the three, so this sync's skip list stays about
 * genuine problems rather than about the ~1,300 rows that were never branches.
 *
 * Syncs `name`, plus SAP's Inactive flag: an inactive warehouse soft-deletes its branch
 * and sets it `inactive`, and a branch SAP stops returning (deleted, or retyped away from
 * `Branch`) is retired the same way when the pass completes. Either comes back restored
 * and `active` once SAP returns it active. Area, dealer, primary warehouse and the rest
 * are ISMS-only classifications with no SAP counterpart; a branch created here lands with
 * them unset and a later sync never touches them.
 */

interface BranchRecord {
  sapCode: string;
  name: string;
  isInactive: boolean;
}

export const branchWarehouseSyncEntity: SapSyncEntity<BranchRecord> = {
  key: "branch-from-warehouse",
  noun: { one: "branch", many: "branches" },

  entity: "Warehouses",
  select: "WarehouseCode,WarehouseName,Inactive",
  filter: sapWarehouseTypeFilter(SAP_WAREHOUSE_TYPES.branch),
  keyField: "WarehouseCode",
  keyKind: "string",

  audit: { action: "branch.sap_sync", entityType: "Branch" },

  parse(row) {
    const sapCode = sapText(row.WarehouseCode);
    if (!sapCode) return { skip: "SAP branch has no warehouse code" };

    const name = sapText(row.WarehouseName);
    if (!name) return { skip: "SAP branch has no name", example: sapCode };

    return { record: { sapCode, name, isInactive: parseSapFlag(row.Inactive) } };
  },

  applyPage(tenantId, records) {
    return branchRepository.applySapSyncPage(tenantId, records);
  },

  // The primary branch source, so it also retires branches no sync has ever claimed —
  // ones created by hand or imported that SAP does not hold.
  reconcile: {
    markSeen: (tenantId, records, passMark) =>
      branchRepository.markSapSyncSeen(
        tenantId,
        records.map((record) => record.sapCode),
        passMark,
        branchWarehouseSyncEntity.key,
      ),
    retireUnseen: (tenantId, passMark) =>
      branchRepository.retireUnseenSapBranches(
        tenantId,
        passMark,
        branchWarehouseSyncEntity.key,
        true,
      ),
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
