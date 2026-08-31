import { auditService } from "@/features/audit/services/audit.service";
import type {
  SapMasterSyncResult,
  SapMasterSyncSkip,
} from "@/features/sap/schemas/sap-master-sync.schema";
import { fetchSapCollection, sapErrorMessage } from "@/features/sap/services/sap-master-data";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { withSapSyncLock } from "@/features/sap/services/sap-sync-lock";
import { serialNumberRepository } from "@/features/serial-numbers/repositories/serial-number.repository";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";
import { logger } from "@/lib/shared/logger";

/**
 * A serial row as any of the candidate entity sets returns it. Every field is optional
 * because which ones exist depends on which entity answered.
 */
interface SapSerialRecord {
  InternalSerialNumber?: string | null;
  DistNumber?: string | null;
  ItemCode?: string | null;
}

interface SapSerialSource {
  entity: string;
  select: string;
  /** Paging by `$skip` needs a stable sort, so this is the entity's key. */
  orderBy: string;
  read: (record: SapSerialRecord) => { serialNo: string; itemCode: string };
}

/**
 * Where serial master data lives depends on the B1 version: `SerialNumberDetails` is
 * OSRN's entity set on current Service Layer (the counterpart of `BatchNumberDetails`
 * for batches), while some builds expose the older `SerialNumbers`. Asking for the
 * wrong one fails the whole sync with "Unrecognized resource path", so we probe in
 * order and use the first that answers instead of hard-coding one name.
 *
 * Field names differ with the entity, hence a per-source `read`.
 */
const SAP_SERIAL_SOURCES: SapSerialSource[] = [
  {
    entity: "SerialNumberDetails",
    select: "InternalSerialNumber,ItemCode",
    orderBy: "DocEntry",
    read: (record) => ({
      // Per the integration mapping the serial is OSRN.DistNumber, which the Service
      // Layer exposes on this entity as `InternalSerialNumber` (B1's "Serial Number").
      // The manufacturer serial (OSRN.MnfSerial) is deliberately not used as a
      // fallback — it is a different value and would not match the PSG import.
      serialNo: (record.InternalSerialNumber ?? "").trim(),
      itemCode: (record.ItemCode ?? "").trim(),
    }),
  },
  {
    // Older builds expose OSRN under its column names directly.
    entity: "SerialNumbers",
    select: "DistNumber,ItemCode",
    orderBy: "DistNumber",
    read: (record) => ({
      serialNo: (record.DistNumber ?? "").trim(),
      itemCode: (record.ItemCode ?? "").trim(),
    }),
  },
];

/**
 * One cheap row against a candidate: a wrong entity name or a wrong `$select` field
 * both come back 400, so this settles both before committing to a full read.
 */
async function probeSource(
  creds: SapServiceLayerCredentials,
  source: SapSerialSource,
): Promise<string | null> {
  const response = await sapServiceLayerClient.request({
    creds,
    method: "GET",
    path: `/${source.entity}?$select=${source.select}&$orderby=${source.orderBy}&$skip=0`,
    headers: { Prefer: "odata.maxpagesize=1" },
  });
  if (response.statusCode >= 400) {
    return sapErrorMessage(response.statusCode, response.rawBody, source.entity);
  }
  return null;
}

/** Resolve which entity set this SAP exposes, then read every serial from it. */
async function fetchSerials(creds: SapServiceLayerCredentials) {
  const attempts: string[] = [];

  for (const source of SAP_SERIAL_SOURCES) {
    const failure = await probeSource(creds, source);
    if (failure) {
      attempts.push(`${source.entity}: ${failure}`);
      continue;
    }

    logger.info({ entity: source.entity }, "sap serial entity resolved");
    const records = await fetchSapCollection<SapSerialRecord>(creds, {
      entity: source.entity,
      select: source.select,
      orderBy: source.orderBy,
    });
    return { source, records };
  }

  throw new Error(
    "SAP did not accept any known serial number entity. Tried " +
      `${attempts.join("; ")}. Check the Service Layer version and its $metadata for the ` +
      "serial master entity set.",
  );
}

async function runSync(tenantId: string, actorUserId: string): Promise<SapMasterSyncResult> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) {
    throw new Error(
      "No active SAP Service Layer connection. Enable one under Settings → SAP Integration → Service Layer.",
    );
  }

  const { source, records } = await fetchSerials(creds);

  // `SerialNumber.modelId` is a required FK, so a serial cannot be stored until its
  // item exists in ISMS. The model sync runs immediately before this one, so an unmatched
  // item code now means SAP's item read did not carry it — not that the user skipped a
  // step. Those serials are reported and land on a later run once the item appears.
  const models = await serialNumberRepository.listModelOptions(tenantId);
  const modelIdBySku = new Map(models.map((model) => [model.skuCode, model.id]));

  // SAP is not always consistent about ItemCode casing between OITM and OSRN, and an
  // exact-only match reports those serials as "model not in ISMS" when the model is
  // plainly there. A case-folded fallback catches them; a fold that two SKUs share is
  // stored as null so the fallback can never guess the wrong parent.
  const modelIdByFoldedSku = new Map<string, string | null>();
  for (const model of models) {
    const folded = model.skuCode.toUpperCase();
    modelIdByFoldedSku.set(folded, modelIdByFoldedSku.has(folded) ? null : model.id);
  }

  const existing = await serialNumberRepository.listSapSyncSnapshot(tenantId);
  const bySerialNo = new Map(existing.map((serial) => [serial.serialNo, serial]));

  const skipped: SapMasterSyncSkip[] = [];
  const toCreate: { serialNo: string; modelId: string }[] = [];
  const toUpdate: { id: string; serialNo: string; modelId: string }[] = [];
  const seen = new Set<string>();
  let unchanged = 0;
  let missingModels = 0;

  for (const record of records) {
    const { serialNo, itemCode } = source.read(record);

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

    const modelId = itemCode
      ? (modelIdBySku.get(itemCode) ?? modelIdByFoldedSku.get(itemCode.toUpperCase()) ?? undefined)
      : undefined;
    if (!modelId) {
      missingModels += 1;
      skipped.push({
        sapCode: serialNo,
        name: itemCode || null,
        reason: itemCode
          ? `Model ${itemCode} was not returned by the SAP item sync`
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
      entity: source.entity,
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
   * Invoked by the model sync rather than on its own: serials are children of a model,
   * so the parent's run is what guarantees the item exists before its serials are read.
   * Serials whose item is still missing are skipped with that reason and land on a later
   * run once SAP returns the item.
   */
  syncFromSap(tenantId: string, actorUserId: string): Promise<SapMasterSyncResult> {
    return withSapSyncLock(`serial-number:${tenantId}`, () => runSync(tenantId, actorUserId));
  },
};
