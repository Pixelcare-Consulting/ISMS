import { auditService } from "@/features/audit/services/audit.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import type {
  BranchSapSyncResult,
  BranchSapSyncSkip,
} from "@/features/branches/schemas/branch-sap-sync.schema";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";
import type { BranchStatus } from "@/lib/database/generated/prisma/client";

/**
 * SAP B1 Service Layer entity holding branch master data (OBPL / "Business Places").
 * If a tenant maps ISMS branches onto a different entity, these three constants and
 * `readSapRecord` below are the only things that need to change — e.g. `BusinessPartners`
 * with `CardCode`/`CardName`, or `Warehouses` with `WarehouseCode`/`WarehouseName`.
 */
const SAP_BRANCH_ENTITY = "BusinessPlaces";
const SAP_BRANCH_SELECT = "BPLID,BPLName,AliasName,Disabled";

/**
 * Service Layer caps page size server-side (default 20), so `$top` is unreliable —
 * we page with `$skip` until a request comes back empty. The cap is a runaway guard.
 */
const MAX_PAGES = 200;

interface SapBranchRecord {
  BPLID?: number | string | null;
  BPLName?: string | null;
  AliasName?: string | null;
  Disabled?: boolean | string | null;
}

interface SapCollectionResponse {
  value?: SapBranchRecord[];
}

/** SAP reports "disabled" as tYES/tNO on most master-data entities, boolean on some. */
function toBranchStatus(disabled: SapBranchRecord["Disabled"]): BranchStatus {
  if (typeof disabled === "boolean") return disabled ? "inactive" : "active";
  const value = (disabled ?? "").toString().trim().toLowerCase();
  return value === "tyes" || value === "y" || value === "true" ? "inactive" : "active";
}

function readSapRecord(record: SapBranchRecord) {
  return {
    sapCode: record.BPLID == null ? "" : String(record.BPLID).trim(),
    name: (record.BPLName ?? record.AliasName ?? "").trim(),
    status: toBranchStatus(record.Disabled),
  };
}

/** Surface SAP's own error text — a bare status code is useless for diagnosing this. */
function sapErrorMessage(statusCode: number, rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody) as {
      error?: { message?: string | { value?: string } };
    };
    const message = parsed.error?.message;
    const text = typeof message === "string" ? message : message?.value;
    if (text) return `SAP returned ${statusCode}: ${text}`;
  } catch {
    // Non-JSON body (HTML error page, proxy response) — fall through.
  }
  return `SAP returned ${statusCode} while reading ${SAP_BRANCH_ENTITY}`;
}

async function fetchSapBranches(
  creds: SapServiceLayerCredentials,
): Promise<SapBranchRecord[]> {
  const records: SapBranchRecord[] = [];
  let skip = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await sapServiceLayerClient.request<SapCollectionResponse>({
      creds,
      method: "GET",
      path: `/${SAP_BRANCH_ENTITY}?$select=${SAP_BRANCH_SELECT}&$skip=${skip}`,
    });

    if (response.statusCode >= 400) {
      throw new Error(sapErrorMessage(response.statusCode, response.rawBody));
    }

    const batch = response.data?.value ?? [];
    if (batch.length === 0) break;

    records.push(...batch);
    skip += batch.length;
  }

  return records;
}

export const branchSapSyncService = {
  /** Pull branch master data from SAP and upsert ISMS branches matched on sapCode. */
  async syncFromSap(tenantId: string, actorUserId: string): Promise<BranchSapSyncResult> {
    const creds = await sapServiceLayerService.getCredentials(tenantId);
    if (!creds) {
      throw new Error(
        "No active SAP Service Layer connection. Enable one under Settings → SAP Integration → Service Layer.",
      );
    }

    const records = await fetchSapBranches(creds);
    const existing = await branchRepository.listSapSyncSnapshot(tenantId);
    const bySapCode = new Map(existing.map((branch) => [branch.sapCode, branch]));

    const skipped: BranchSapSyncSkip[] = [];
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

    const result: BranchSapSyncResult = {
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
