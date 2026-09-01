import { sapText } from "@/features/sap/services/sap-master-data";
import { runSapSync } from "@/features/sap/services/sap-sync-engine";
import type { SapSyncEntity } from "@/features/sap/types/sap-sync-entity";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { serialNumberRepository } from "@/features/serial-numbers/repositories/serial-number.repository";

/**
 * Serial number master data (OSRN).
 *
 * `SerialNumberDetails` is the Service Layer's name for it — the counterpart of
 * `BatchNumberDetails` for batches. OSRN's own column names are not the entity set's:
 * `SerialNumbers` is not a resource path and answers "Unrecognized resource path".
 *
 * At ~4M rows this is the entity the whole sliced design exists for, but it is described
 * here exactly like the others; the engine is what notices it takes several runs.
 */

interface SerialRecord {
  serialNo: string;
  modelId: string;
}

/** Item codes ISMS knows, so a serial can be linked to the model it belongs to. */
type ModelIndex = Map<string, string>;

export const serialNumberSyncEntity: SapSyncEntity<SerialRecord, ModelIndex> = {
  key: "serial-number",
  noun: { one: "serial number", many: "serial numbers" },

  entity: "SerialNumberDetails",
  /**
   * `SerialNumber` is what the Service Layer calls OSRN.DistNumber, the serial the
   * integration mapping specifies. Deliberately not `MfrSerialNo` (OSRN.MnfSerial): that
   * is a different value and would not match the serials the PSG import already carries.
   */
  select: "DocEntry,SerialNumber,ItemCode",
  keyField: "DocEntry",
  keyKind: "number",

  audit: { action: "serial_number.sap_sync", entityType: "SerialNumber" },

  /**
   * `SerialNumber.modelId` is a required FK, so a serial cannot be stored until its item
   * exists in ISMS. Models number in the thousands, so this index is cheap to hold for a
   * whole run — unlike the serials themselves.
   */
  async prepare(tenantId) {
    const models = await serialNumberRepository.listModelOptions(tenantId);
    return new Map(models.map((model) => [model.skuCode, model.id]));
  },

  parse(row, modelIdBySku) {
    const serialNo = sapText(row.SerialNumber);
    const itemCode = sapText(row.ItemCode);

    if (!serialNo) return { skip: "SAP row has no serial number" };

    const modelId = itemCode ? modelIdBySku.get(itemCode) : undefined;
    if (!modelId) {
      // Nothing is lost by skipping: the next pass re-reads this row, so a serial links
      // itself as soon as its model arrives — no bookkeeping needed to come back for it.
      return {
        skip: "Item is not in ISMS yet — sync Models from SAP (Settings → Master Data)",
        example: itemCode || null,
      };
    }

    return { record: { serialNo, modelId } };
  },

  applyPage(tenantId, records) {
    return serialNumberRepository.applySapSyncPage(tenantId, records);
  },
};

export const serialNumberSapSyncService = {
  /**
   * Pull serial master data from SAP into the ISMS registry.
   *
   * One call is a slice of the work, not necessarily all of it: at ~4M rows a full pass
   * takes several runs, and `caughtUp` says whether SAP has more. The cron calls this
   * repeatedly until it does.
   *
   * Registry only — no inventory is created. A synced serial exists with no branch or
   * warehouse location until something in ISMS places it.
   */
  syncFromSap(
    tenantId: string,
    /** Null for scheduled runs — `AuditLog.userId` is nullable and means "not a person". */
    actorUserId: string | null,
    options?: { budgetMs?: number },
  ): Promise<SapSyncResult> {
    return runSapSync(tenantId, serialNumberSyncEntity, actorUserId, options);
  },
};
