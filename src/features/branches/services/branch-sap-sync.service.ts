import { auditService } from "@/features/audit/services/audit.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import type {
  SapMasterSyncResult,
  SapMasterSyncSkip,
} from "@/features/sap/schemas/sap-master-sync.schema";
import { fetchSapCollection } from "@/features/sap/services/sap-master-data";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { runTrackedSapSync } from "@/features/sap/services/sap-sync-runner";

/**
 * SAP B1 Service Layer entity holding branch master data — the multi-branch feature
 * (DI API `Branches` object, table OBRA), not `BusinessPlaces` (a separate, unrelated
 * entity). `Branches` carries no active/inactive flag, so branch status stays
 * ISMS-managed: new branches land `active`, and sync never touches status on update.
 */
const SAP_BRANCH_ENTITY = "Branches";
const SAP_BRANCH_SELECT = "Code,Name,Description";
const SAP_BRANCH_ORDER_BY = "Code";

interface SapBranchRecord {
  Code?: number | string | null;
  Name?: string | null;
  Description?: string | null;
}

function readSapRecord(record: SapBranchRecord) {
  return {
    sapCode: record.Code == null ? "" : String(record.Code).trim(),
    // `||`, not `??` — Service Layer returns "" for unset strings, so a blank Name
    // has to fall through to Description the same way a null one does.
    name: (record.Name || record.Description || "").trim(),
  };
}

async function runSync(tenantId: string, actorUserId: string): Promise<SapMasterSyncResult> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) {
    throw new Error(
      "No active SAP Service Layer connection. Enable one under Settings → SAP Integration → Service Layer.",
    );
  }

  const records = await fetchSapCollection<SapBranchRecord>(creds, {
    entity: SAP_BRANCH_ENTITY,
    select: SAP_BRANCH_SELECT,
    orderBy: SAP_BRANCH_ORDER_BY,
  });
  const existing = await branchRepository.listSapSyncSnapshot(tenantId);
  const bySapCode = new Map(existing.map((branch) => [branch.sapCode, branch]));

  const skipped: SapMasterSyncSkip[] = [];
  const toCreate: { sapCode: string; name: string }[] = [];
  const toUpdate: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  let unchanged = 0;

  for (const record of records) {
    const { sapCode, name } = readSapRecord(record);

    if (!sapCode) {
      skipped.push({ sapCode: null, name: name || null, reason: "Missing branch code" });
      continue;
    }
    // `seen` drives both dedupe and `notInSap`, so a code SAP actually returned has to
    // register here even if the row is skipped below — otherwise the branch gets
    // reported as "no matching SAP record" when SAP does know about it.
    if (seen.has(sapCode)) {
      skipped.push({ sapCode, name, reason: "Duplicate branch code in SAP response" });
      continue;
    }
    seen.add(sapCode);

    if (!name) {
      skipped.push({ sapCode, name: null, reason: "Missing branch name" });
      continue;
    }

    const match = bySapCode.get(sapCode);
    if (!match) {
      toCreate.push({ sapCode, name });
      continue;
    }
    // A soft-deleted branch still holds the sapCode unique slot, so re-creating would
    // fail. Surface it instead of silently reviving a branch someone chose to remove.
    if (match.deletedAt) {
      skipped.push({
        sapCode,
        name,
        reason: "Matches a deleted ISMS branch — restore it before syncing",
      });
      continue;
    }
    if (match.name === name) {
      unchanged += 1;
      continue;
    }
    toUpdate.push({ id: match.id, name });
  }

  if (toCreate.length > 0 || toUpdate.length > 0) {
    await branchRepository.applySapSync(tenantId, { create: toCreate, update: toUpdate });
  }

  const result: SapMasterSyncResult = {
    fetched: records.length,
    created: toCreate.length,
    updated: toUpdate.length,
    unchanged,
    skipped,
    notInSap: existing.filter((branch) => !branch.deletedAt && !seen.has(branch.sapCode)).length,
  };

  await auditService.log({
    tenantId,
    userId: actorUserId,
    action: "branch.sap_sync",
    entityType: "Branch",
    metadata: {
      entity: SAP_BRANCH_ENTITY,
      fetched: result.fetched,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      skipped: result.skipped.length,
      notInSap: result.notInSap,
    },
  });

  return result;
}

export const branchSapSyncService = {
  /**
   * Pull branch master data from SAP and upsert ISMS branches matched on sapCode.
   * Locked per tenant so a second call (another tab, a stale page re-triggering after
   * the first sync already finished) joins the same run instead of hitting SAP twice.
   */
  syncFromSap(tenantId: string, actorUserId: string): Promise<SapMasterSyncResult> {
    return runTrackedSapSync(tenantId, "branch", actorUserId, () =>
      runSync(tenantId, actorUserId),
    );
  },
};
