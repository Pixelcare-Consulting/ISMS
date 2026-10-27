import { sapText } from "@/features/sap/services/sap-master-data";
import { runSapSync } from "@/features/sap/services/sap-sync-engine";
import type { SapSyncEntity } from "@/features/sap/types/sap-sync-entity";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { serialNumberRepository } from "@/features/serial-numbers/repositories/serial-number.repository";
import {
  gateSerialPageByWarehouse,
  readSerialPageLocations,
  SERIAL_WAREHOUSE_MISSING_REASON,
} from "@/features/serial-numbers/services/serial-onhand-stamp";
import {
  loadMasterWarehouseAllowList,
  replicateOnHandSerialsToStk,
} from "@/features/serial-numbers/services/serial-stock-replicate";

/**
 * Serial number master data (OSRN).
 *
 * `SerialNumberDetails` is the Service Layer's name for it — the counterpart of
 * `BatchNumberDetails` for batches. OSRN's own column names are not the entity set's:
 * `SerialNumbers` is not a resource path and answers "Unrecognized resource path".
 *
 * At ~4M rows this is the entity the whole sliced design exists for, but it is described
 * here exactly like the others; the engine is what notices it takes several runs.
 *
 * It is also the only sync that walks a *segment* — the fetch is restricted to the item
 * codes ISMS actually holds, rather than reading OSRN whole and discarding most of it.
 */

interface SerialRecord {
  serialNo: string;
  modelId: string;
  itemCode: string;
  /** OSRN.AbsEntry — the on-hand query is keyed by this, not by warehouse. */
  docEntry: number;
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

  /**
   * Only serials belonging to items ISMS holds are fetched at all.
   *
   * A serial whose item is not in `product_models` can never be stored — `modelId` is a
   * required FK — so reading it is pure cost, and at OSRN's scale that cost is the whole
   * sync. Since the item sync now takes only branded items (`U_Brand`), this narrows the
   * walk to the serials of branded stock rather than the entire four-million-row table.
   *
   * The item list is far too large for one Service Layer URL, so the engine walks it in
   * segments and pages by `DocEntry` inside each; see `SapSyncSegment`. The `parse` guard
   * below stays as the backstop for a row SAP returns that the filter did not exclude.
   */
  segment: {
    field: "ItemCode",
    kind: "string",
    keys: (modelIdBySku) => [...modelIdBySku.keys()],
  },

  audit: { action: "serial_number.sap_sync", entityType: "SerialNumber" },

  /**
   * `SerialNumber.modelId` is a required FK, so a serial cannot be stored until its item
   * exists in ISMS. Models number in the thousands, so this index is cheap to hold for a
   * whole run — unlike the serials themselves.
   *
   * With no models at all, every row SAP returns is unusable and the only thing reading
   * four million of them can establish is that fact. Stopping here says so in one step,
   * with the action that fixes it, instead of burning a pass to arrive at an empty result
   * that reads like SAP had nothing to send.
   */
  async prepare(tenantId) {
    const models = await serialNumberRepository.listSapSyncModelKeys(tenantId);
    if (models.length === 0) {
      throw new Error(
        "No product models in ISMS yet. Serial numbers link to a model, so sync Models " +
          "from SAP first (Settings → Master Data → Models), then run this again.",
      );
    }
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

    return { record: { serialNo, modelId, itemCode, docEntry: Number(row.DocEntry) } };
  },

  /**
   * A serial is only taken when SAP holds it nowhere (sold or shipped out) or in a
   * warehouse ISMS has. One held in a warehouse ISMS lacks is neither created nor
   * updated, and is reported by warehouse code. The engine still marks it seen, so an
   * existing serial is not retired for it; it is picked up once that warehouse is synced.
   */
  async applyPage(tenantId, records) {
    const { onHand, notOnHand } = await readSerialPageLocations(tenantId, records);
    const allowList = await loadMasterWarehouseAllowList(tenantId);
    const { writable, known, missing } = gateSerialPageByWarehouse(records, onHand, allowList);

    const applied =
      writable.length > 0
        ? await serialNumberRepository.applySapSyncPage(
            tenantId,
            writable.map(({ serialNo, modelId, docEntry }) => ({ serialNo, modelId, docEntry })),
          )
        : { created: 0, updated: 0, unchanged: 0, failures: [] };

    if (writable.length > 0) {
      const modelIds = [...new Set(writable.map((row) => row.modelId))];
      await serialNumberRepository.setSapOnHandFlags(tenantId, modelIds, known, notOnHand);
      // SAP stock-in: a serial in a branch's warehouse becomes Stock at that branch.
      await replicateOnHandSerialsToStk(tenantId, known);
    }

    return {
      ...applied,
      failures: [
        ...applied.failures,
        ...missing.map((row) => ({
          reason: SERIAL_WAREHOUSE_MISSING_REASON,
          example: row.warehouseCode || null,
        })),
      ],
    };
  },

  /**
   * The walk is the models still in Master data. A completed pass removes serials whose
   * model is no longer in Master data, unless a count, delivery, or sale is still open.
   * Serials of a model still in Master data stay.
   */
  reconcile: {
    markSeen: (tenantId, records, passMark) =>
      serialNumberRepository.markSapSyncSeen(
        tenantId,
        records.map((record) => record.serialNo),
        passMark,
      ),
    retireUnseen: (tenantId, passMark) =>
      serialNumberRepository.retireUnseenSapSerials(tenantId, passMark),
  },
};

/** The prompt for serials held back because their SAP warehouse is not in ISMS. */
function missingWarehouseNote(result: SapSyncResult): string | null {
  const skip = result.skipped.find((entry) => entry.reason === SERIAL_WAREHOUSE_MISSING_REASON);
  if (!skip) return null;
  const codes = skip.examples.length > 0 ? ` (${skip.examples.join(", ")})` : "";
  return (
    `${skip.count.toLocaleString()} serial numbers are in SAP warehouses that are not in ` +
    `ISMS${codes}. Sync those warehouses first, then run the serial sync again`
  );
}

export const serialNumberSapSyncService = {
  /**
   * Pull serial master data from SAP into the ISMS registry, linking each serial to the
   * SAP warehouse that holds it.
   *
   * One call is a slice of the work, not necessarily all of it: at ~4M rows a full pass
   * takes several runs, and `caughtUp` says whether SAP has more. The cron calls this
   * repeatedly until it does.
   *
   * Serials in a warehouse ISMS does not have are held back and named in `notes`. If the
   * warehouse read itself fails, the slice fails: the sync cannot tell which serials it
   * may take.
   */
  async syncFromSap(
    tenantId: string,
    /** Null for scheduled runs — `AuditLog.userId` is nullable and means "not a person". */
    actorUserId: string | null,
    options?: { budgetMs?: number },
  ): Promise<SapSyncResult> {
    const result = await runSapSync(tenantId, serialNumberSyncEntity, actorUserId, options);
    const note = missingWarehouseNote(result);
    return note ? { ...result, notes: [...(result.notes ?? []), note] } : result;
  },
};
