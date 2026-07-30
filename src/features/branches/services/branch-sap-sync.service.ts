import { auditService } from "@/features/audit/services/audit.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import type {
  SapMasterSyncResult,
  SapMasterSyncSkip,
} from "@/features/sap/schemas/sap-master-sync.schema";
import {
  fetchSapCollection,
  parseSapFlag,
} from "@/features/sap/services/sap-master-data";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import type { BranchStatus } from "@/lib/database/generated/prisma/client";

/**
 * SAP B1 Service Layer entity holding branch master data (OBPL / "Business Places").
 * If a tenant maps ISMS branches onto a different entity, these constants and
 * `readSapRecord` below are the only things that need to change — e.g. `BusinessPartners`
 * with `CardCode`/`CardName`.
 */
const SAP_BRANCH_ENTITY = "BusinessPlaces";
const SAP_BRANCH_SELECT = "BPLID,BPLName,AliasName,Disabled";

interface SapBranchRecord {
  BPLID?: number | string | null;
  BPLName?: string | null;
  AliasName?: string | null;
  Disabled?: boolean | string | null;
}

function readSapRecord(record: SapBranchRecord) {
  return {
    sapCode: record.BPLID == null ? "" : String(record.BPLID).trim(),
    name: (record.BPLName ?? record.AliasName ?? "").trim(),
    status: (parseSapFlag(record.Disabled) ? "inactive" : "active") as BranchStatus,
  };
}

export const branchSapSyncService = {
  /** Pull branch master data from SAP and upsert ISMS branches matched on sapCode. */
  async syncFromSap(tenantId: string, actorUserId: string): Promise<SapMasterSyncResult> {
    const creds = await sapServiceLayerService.getCredentials(tenantId);
    if (!creds) {
      throw new Error(
        "No active SAP Service Layer connection. Enable one under Settings → SAP Integration → Service Layer.",
      );
    }

    const records = await fetchSapCollection<SapBranchRecord>(creds, {
      entity: SAP_BRANCH_ENTITY,
      select: SAP_BRANCH_SELECT,
    });
    const existing = await branchRepository.listSapSyncSnapshot(tenantId);
    const bySapCode = new Map(existing.map((branch) => [branch.sapCode, branch]));

    const skipped: SapMasterSyncSkip[] = [];
    const toCreate: { sapCode: string; name: string; status: BranchStatus }[] = [];
    const toUpdate: { id: string; name: string; status: BranchStatus }[] = [];
    const seen = new Set<string>();
    let unchanged = 0;

    for (const record of records) {
      const { sapCode, name, status } = readSapRecord(record);

      if (!sapCode) {
        skipped.push({ sapCode: null, name: name || null, reason: "Missing branch code" });
        continue;
      }
      if (!name) {
        skipped.push({ sapCode, name: null, reason: "Missing branch name" });
        continue;
      }
      if (seen.has(sapCode)) {
        skipped.push({ sapCode, name, reason: "Duplicate branch code in SAP response" });
        continue;
      }
      seen.add(sapCode);

      const match = bySapCode.get(sapCode);
      if (!match) {
        toCreate.push({ sapCode, name, status });
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
      if (match.name === name && match.status === status) {
        unchanged += 1;
        continue;
      }
      toUpdate.push({ id: match.id, name, status });
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
      notInSap: existing.filter(
        (branch) => !branch.deletedAt && !seen.has(branch.sapCode),
      ).length,
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
  },
};
