import { branchRepository } from "@/features/branches/repositories/branch.repository";
import { sapText } from "@/features/sap/services/sap-master-data";
import { runSapSync } from "@/features/sap/services/sap-sync-engine";
import type { SapSyncEntity } from "@/features/sap/types/sap-sync-entity";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";

/**
 * Branch master data → ISMS branches, matched on `sapCode`.
 *
 * `Branches` is the multi-branch feature (DI API `Branches` object, table OBRA), not
 * `BusinessPlaces` — a separate, unrelated entity. It carries no active/inactive flag, so
 * branch status stays ISMS-managed: new branches land `active`, and a sync never touches
 * status on update.
 */

interface BranchRecord {
  sapCode: string;
  name: string;
}

export const branchSyncEntity: SapSyncEntity<BranchRecord> = {
  key: "branch",
  noun: { one: "branch", many: "branches" },

  entity: "Branches",
  select: "Code,Name,Description",
  keyField: "Code",
  keyKind: "number",

  audit: { action: "branch.sap_sync", entityType: "Branch" },

  parse(row) {
    const sapCode = sapText(row.Code);
    if (!sapCode) return { skip: "SAP branch has no code" };

    // `||`, not `??` — the Service Layer returns "" for unset strings, so a blank Name
    // has to fall through to Description the same way a null one does.
    const name = sapText(row.Name) || sapText(row.Description);
    if (!name) return { skip: "SAP branch has no name", example: sapCode };

    return { record: { sapCode, name } };
  },

  applyPage(tenantId, records) {
    return branchRepository.applySapSyncPage(tenantId, records);
  },
};

export const branchSapSyncService = {
  /** Pull branch master data from SAP and upsert ISMS branches. */
  syncFromSap(
    tenantId: string,
    actorUserId: string | null,
    options?: { budgetMs?: number },
  ): Promise<SapSyncResult> {
    return runSapSync(tenantId, branchSyncEntity, actorUserId, options);
  },
};
