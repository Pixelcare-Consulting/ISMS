import { auditService } from "@/features/audit/services/audit.service";
import type {
  SapMasterSyncResult,
  SapMasterSyncSkip,
} from "@/features/sap/schemas/sap-master-sync.schema";
import { fetchSapCollection } from "@/features/sap/services/sap-master-data";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { withSapSyncLock } from "@/features/sap/services/sap-sync-lock";
import { serialNumberRepository } from "@/features/serial-numbers/repositories/serial-number.repository";

/**
 * SAP B1 Service Layer entity holding serial number master data (OSRN) — the
 * counterpart of `BatchNumberDetails` for batches. OSRN's own column names are not the
 * entity set's: `SerialNumbers` is not a resource path at all, and asking for it fails
 * the sync with "Unrecognized resource path".
 */
const SAP_SERIAL_ENTITY = "SerialNumberDetails";
/**
 * `SerialNumber` is what the Service Layer calls OSRN.DistNumber, the serial the
 * integration mapping specifies. Deliberately not `MfrSerialNo` (OSRN.MnfSerial): that
 * is a different value and would not match the serials the PSG import already carries.
 */
const SAP_SERIAL_SELECT = "SerialNumber,ItemCode";
/** DocEntry is the entity's key, and paging by `$skip` needs a stable sort. */
const SAP_SERIAL_ORDER_BY = "DocEntry";

interface SapSerialRecord {
  SerialNumber?: string | null;
  ItemCode?: string | null;
}

function readSapRecord(record: SapSerialRecord) {
  return {
    serialNo: (record.SerialNumber ?? "").trim(),
    itemCode: (record.ItemCode ?? "").trim(),
  };
}

async function runSync(tenantId: string, actorUserId: string): Promise<SapMasterSyncResult> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) {
    throw new Error(
      "No active SAP Service Layer connection. Enable one under Settings → SAP Integration → Service Layer.",
    );
  }

  const records = await fetchSapCollection<SapSerialRecord>(creds, {
    entity: SAP_SERIAL_ENTITY,
    select: SAP_SERIAL_SELECT,
    orderBy: SAP_SERIAL_ORDER_BY,
  });

  // `SerialNumber.modelId` is a required FK, so a serial cannot be stored until its
  // item exists in ISMS. Anything unmatched is reported, telling the user to run the
  // model sync first — re-running this sync afterwards picks those serials up.
  const models = await serialNumberRepository.listModelOptions(tenantId);
  const modelIdBySku = new Map(models.map((model) => [model.skuCode, model.id]));

  const existing = await serialNumberRepository.listSapSyncSnapshot(tenantId);
  const bySerialNo = new Map(existing.map((serial) => [serial.serialNo, serial]));

  const skipped: SapMasterSyncSkip[] = [];
  const toCreate: { serialNo: string; modelId: string }[] = [];
  const toUpdate: { id: string; serialNo: string; modelId: string }[] = [];
  const seen = new Set<string>();
  let unchanged = 0;
  let missingModels = 0;

  for (const record of records) {
    const { serialNo, itemCode } = readSapRecord(record);

    if (!serialNo) {
      skipped.push({ sapCode: itemCode || null, name: null, reason: "Missing serial number" });
      continue;
    }
    // `seen` drives both dedupe and `notInSap`, so a serial SAP actually returned has
    // to register here even if the row is skipped below.
    if (seen.has(serialNo)) {
      // SAP keys serials per item, so the same serial can legitimately exist under
      // two ItemCodes. ISMS is unique on serialNo alone, so only the first can land.
      skipped.push({
        sapCode: serialNo,
        name: itemCode || null,
        reason: "Serial number already used by another item",
      });
      continue;
    }
    seen.add(serialNo);

    const modelId = itemCode ? modelIdBySku.get(itemCode) : undefined;
    if (!modelId) {
      missingModels += 1;
      skipped.push({
        sapCode: serialNo,
        name: itemCode || null,
        reason: itemCode
          ? `Model ${itemCode} is not in ISMS — sync Models from SAP first`
          : "Serial has no item code in SAP",
      });
      continue;
    }

    const match = bySerialNo.get(serialNo);
    if (!match) {
      toCreate.push({ serialNo, modelId });
      continue;
    }
    if (match.modelId === modelId) {
      unchanged += 1;
      continue;
    }
    toUpdate.push({ id: match.id, serialNo, modelId });
  }

  const applied = await serialNumberRepository.applySapSync(tenantId, {
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
    // Serials also enter ISMS through the PSG import, so unlike dealers and models this
    // one can legitimately be non-zero. Reported only — nothing is ever removed.
    notInSap: existing.filter((serial) => !seen.has(serial.serialNo)).length,
  };

  await auditService.log({
    tenantId,
    userId: actorUserId,
    action: "serial_number.sap_sync",
    entityType: "SerialNumber",
    metadata: {
      entity: SAP_SERIAL_ENTITY,
      fetched: result.fetched,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      skipped: result.skipped.length,
      missingModels,
      notInSap: result.notInSap,
    },
  });

  return result;
}

export const serialNumberSapSyncService = {
  /**
   * Pull serial number master data from SAP and upsert ISMS serials matched on
   * `serialNo`, linking each to the product model its `ItemCode` resolves to.
   *
   * Registry only — no inventory is created. A synced serial exists with no branch or
   * warehouse location until something in ISMS places it, which is what keeps this
   * sync independent of SAP's stock position.
   *
   * Depends on the model sync: serials whose item is not yet in ISMS are skipped with
   * that reason and land on the next run once models are synced.
   */
  syncFromSap(tenantId: string, actorUserId: string): Promise<SapMasterSyncResult> {
    return withSapSyncLock(`serial-number:${tenantId}`, () => runSync(tenantId, actorUserId));
  },
};
