import { dealerRepository } from "@/features/dealers/repositories/dealer.repository";
import { sapText } from "@/features/sap/services/sap-master-data";
import { runSapSync } from "@/features/sap/services/sap-sync-engine";
import type { SapSyncEntity } from "@/features/sap/types/sap-sync-entity";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import type { BranchStatus } from "@/lib/database/generated/prisma/client";

/**
 * Business partner master data (OCRD) → ISMS dealers, matched on `sapCode`.
 *
 * Active customers only: `CardType eq 'cCustomer'` excludes suppliers (cSupplier) and
 * leads (cLid), which have no ISMS counterpart, and `Valid eq 'tYES' and Frozen eq 'tNO'`
 * excludes anything SAP itself has closed out or blocked — those rows are never fetched,
 * so a dealer that goes inactive in SAP simply stops coming back from the sync.
 *
 * Syncs `name` and `status` only. Area, dealer type, dealer area and mode of payment are
 * ISMS-only classifications with no SAP counterpart and are never touched — dealers
 * created by a sync land with them unset. Nothing is ever deleted: a dealer SAP stops
 * returning is left exactly as it is.
 */

interface DealerRecord {
  sapCode: string;
  name: string;
  status: BranchStatus;
}

export const dealerSyncEntity: SapSyncEntity<DealerRecord> = {
  key: "dealer",
  noun: { one: "dealer", many: "dealers" },

  entity: "BusinessPartners",
  select: "CardCode,CardName",
  filter: "CardType eq 'cCustomer' and Valid eq 'tYES' and Frozen eq 'tNO'",
  keyField: "CardCode",
  keyKind: "string",

  audit: { action: "dealer.sap_sync", entityType: "Dealer" },

  parse(row) {
    // CardCode is OCRD's primary key and the only field matched on, so a row without one
    // cannot be placed. Everything else about a record is allowed to be blank.
    const sapCode = sapText(row.CardCode);
    if (!sapCode) return { skip: "SAP customer has no code" };

    // The `filter` above already restricts the fetch to valid, unfrozen customers, so
    // every row that makes it here is active.
    return {
      // Stored exactly as SAP has it, blanks included — SAP is the source of truth.
      record: { sapCode, name: sapText(row.CardName), status: "active" },
    };
  },

  applyPage(tenantId, records) {
    return dealerRepository.applySapSyncPage(tenantId, records);
  },
};

export const dealerSapSyncService = {
  /** Pull customer master data from SAP and upsert ISMS dealers. */
  syncFromSap(
    tenantId: string,
    actorUserId: string | null,
    options?: { budgetMs?: number },
  ): Promise<SapSyncResult> {
    return runSapSync(tenantId, dealerSyncEntity, actorUserId, options);
  },
};
