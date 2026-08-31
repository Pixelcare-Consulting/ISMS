import { auditService } from "@/features/audit/services/audit.service";
import { dealerRepository } from "@/features/dealers/repositories/dealer.repository";
import type {
  SapMasterSyncResult,
  SapMasterSyncSkip,
} from "@/features/sap/schemas/sap-master-sync.schema";
import {
  fetchSapCollection,
  parseSapFlag,
} from "@/features/sap/services/sap-master-data";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { withSapSyncLock } from "@/features/sap/services/sap-sync-lock";
import type { BranchStatus } from "@/lib/database/generated/prisma/client";

/**
 * SAP B1 Service Layer entity holding business partner master data (OCRD).
 * Customers only — `CardType eq 'cCustomer'` excludes suppliers (cSupplier) and
 * leads (cLid), which have no ISMS counterpart.
 */
const SAP_BP_ENTITY = "BusinessPartners";
const SAP_BP_SELECT = "CardCode,CardName,Valid,Frozen";
const SAP_BP_FILTER = "CardType eq 'cCustomer'";
const SAP_BP_ORDER_BY = "CardCode";

/**
 * Exact wording `describeWriteError` produces for a P2002 on (tenant_id, name), so a
 * row rejected by the pre-flight check below reads identically in the skip report to
 * one the write-time fallback used to catch.
 */
const DUPLICATE_NAME_REASON = "Another ISMS record already uses this name";

interface SapBusinessPartnerRecord {
  CardCode?: string | null;
  CardName?: string | null;
  Valid?: boolean | string | null;
  Frozen?: boolean | string | null;
}

/**
 * SAP gates a partner two ways: `Valid` (master record usable at all) and `Frozen`
 * (temporarily blocked from transactions). Either one closed maps to ISMS `inactive`.
 */
function readSapRecord(record: SapBusinessPartnerRecord) {
  const isValid = parseSapFlag(record.Valid);
  const isFrozen = parseSapFlag(record.Frozen);
  const status: BranchStatus = isValid && !isFrozen ? "active" : "inactive";
  return {
    sapCode: (record.CardCode ?? "").trim(),
    // Stored exactly as SAP has it, blanks included — SAP is the source of truth.
    name: (record.CardName ?? "").trim(),
    status,
  };
}

async function runSync(tenantId: string, actorUserId: string): Promise<SapMasterSyncResult> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) {
    throw new Error(
      "No active SAP Service Layer connection. Enable one under Settings → SAP Integration → Service Layer.",
    );
  }

  const records = await fetchSapCollection<SapBusinessPartnerRecord>(creds, {
    entity: SAP_BP_ENTITY,
    select: SAP_BP_SELECT,
    filter: SAP_BP_FILTER,
    orderBy: SAP_BP_ORDER_BY,
  });
  const existing = await dealerRepository.listSapSyncSnapshot(tenantId);
  // Dealers predating the sync may share a null/blank code; only coded rows can match.
  const bySapCode = new Map(
    existing.filter((dealer) => dealer.sapCode).map((dealer) => [dealer.sapCode as string, dealer]),
  );

  /**
   * Which SAP code currently holds each dealer name.
   *
   * `Dealer` still carries `@@unique([tenantId, name])` while `sapCode` — the field
   * this sync actually matches on — has no unique index, so two SAP customers sharing
   * a `CardName` under different `CardCode`s cannot both land. That used to be
   * discovered at write time, where a single duplicate rejected its whole 500-row
   * `createMany` and forced the batch to retry row by row: 500 round trips and a wall
   * of `prisma:error` output to surface a handful of bad rows. Reserving names here
   * produces the same skip report with no failed writes at all.
   *
   * Case-sensitive, matching the Postgres index — "ACME" and "acme" genuinely are
   * two different rows. Soft-deleted dealers are included because they still occupy
   * their name; `listSapSyncSnapshot` returns them.
   *
   * A name is never released. `applySapSync` writes every create before any update,
   * so a name freed by a rename is still taken while the creates run — pessimistic on
   * purpose, and the skipped row lands on the next sync once the rename has committed.
   */
  const nameOwner = new Map<string, string | null>();
  for (const dealer of existing) {
    if (!nameOwner.has(dealer.name)) nameOwner.set(dealer.name, dealer.sapCode);
  }
  /** True when `name` is spoken for by anyone other than this SAP code. */
  const nameTakenByOther = (name: string, sapCode: string) => {
    const owner = nameOwner.get(name);
    return owner !== undefined && owner !== sapCode;
  };

  const skipped: SapMasterSyncSkip[] = [];
  const toCreate: { sapCode: string; name: string; status: BranchStatus }[] = [];
  const toUpdate: { id: string; sapCode: string; name: string; status: BranchStatus }[] = [];
  const seen = new Set<string>();
  let unchanged = 0;

  for (const record of records) {
    const { sapCode, name, status } = readSapRecord(record);

    // CardCode is OCRD's primary key and the only field we match on, so a row without
    // one cannot be placed. Everything else about a record is allowed to be blank.
    if (!sapCode) {
      skipped.push({ sapCode: null, name: name || null, reason: "Missing customer code" });
      continue;
    }
    // `seen` drives both dedupe and `notInSap`, so a code SAP actually returned has to
    // register here even if the row is skipped below — otherwise the dealer gets
    // reported as "no matching SAP record" when SAP does know about it.
    if (seen.has(sapCode)) {
      skipped.push({ sapCode, name, reason: "Duplicate customer code in SAP response" });
      continue;
    }
    seen.add(sapCode);

    const match = bySapCode.get(sapCode);
    if (!match) {
      if (nameTakenByOther(name, sapCode)) {
        skipped.push({ sapCode, name, reason: DUPLICATE_NAME_REASON });
        continue;
      }
      nameOwner.set(name, sapCode);
      toCreate.push({ sapCode, name, status });
      continue;
    }
    if (match.name === name && match.status === status) {
      unchanged += 1;
      continue;
    }
    // A rename has to clear the same constraint a create does.
    if (match.name !== name) {
      if (nameTakenByOther(name, sapCode)) {
        skipped.push({ sapCode, name, reason: DUPLICATE_NAME_REASON });
        continue;
      }
      nameOwner.set(name, sapCode);
    }
    toUpdate.push({ id: match.id, sapCode, name, status });
  }

  const applied = await dealerRepository.applySapSync(tenantId, {
    create: toCreate,
    update: toUpdate,
  });
  for (const failure of applied.failures) {
    skipped.push({ sapCode: failure.sapCode, name: failure.name, reason: failure.reason });
  }

  const result: SapMasterSyncResult = {
    fetched: records.length,
    created: applied.created,
    updated: applied.updated,
    unchanged,
    skipped,
    // Expected to be 0: with manual creation disabled, every dealer comes from a sync.
    // A non-zero count means SAP stopped returning a row it used to — most likely its
    // CardType changed away from cCustomer. Reported only; nothing is ever removed.
    notInSap: existing.filter((dealer) => !dealer.sapCode || !seen.has(dealer.sapCode)).length,
  };

  await auditService.log({
    tenantId,
    userId: actorUserId,
    action: "dealer.sap_sync",
    entityType: "Dealer",
    metadata: {
      entity: SAP_BP_ENTITY,
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

export const dealerSapSyncService = {
  /**
   * Pull customer master data from SAP and upsert ISMS dealers matched on `sapCode`.
   *
   * Syncs `name` and `status` only. Area, dealer type, dealer area and mode of payment
   * are ISMS-only classifications with no SAP counterpart and are never touched — new
   * dealers land with them unset.
   *
   * Nothing is ever deleted or soft-deleted: dealers SAP no longer returns are counted
   * in `notInSap` and left alone.
   *
   * Locked per tenant so a second call (another tab, a stale page re-triggering after
   * the first sync already finished) joins the same run instead of hitting SAP twice.
   */
  syncFromSap(tenantId: string, actorUserId: string): Promise<SapMasterSyncResult> {
    return withSapSyncLock(`dealer:${tenantId}`, () => runSync(tenantId, actorUserId));
  },
};
