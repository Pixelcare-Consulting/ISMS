import { sapStockPlacementService } from "@/features/inventory/services/sap-stock-placement.service";
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
 *
 * It is also the only sync that walks a *segment* — the fetch is restricted to the item
 * codes ISMS actually holds, rather than reading OSRN whole and discarding most of it.
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

    return { record: { serialNo, modelId } };
  },

  applyPage(tenantId, records) {
    return serialNumberRepository.applySapSyncPage(tenantId, records);
  },

  /**
   * Every ISMS serial belongs to a model, and every model's item code is walked, so a
   * completed pass has seen every serial SAP still holds for ISMS's items — anything left
   * unstamped is gone from SAP.
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

/** Budget for one call when the caller does not set one — matches the sync button's. */
const DEFAULT_BUDGET_MS = 45_000;

export const serialNumberSapSyncService = {
  /**
   * Pull serial master data from SAP into the ISMS registry, then place SAP's on-hand
   * stock into Stock units and Warehouse stock.
   *
   * One call is a slice of the work, not necessarily all of it: at ~4M rows a full pass
   * takes several runs, and so does placement (one warehouse alone holds ~137k serials).
   * `caughtUp` is true only once both are done; until then the sync button offers
   * Continue, and each call picks up where the last one stopped — placement first if it
   * is part-way through, otherwise the serial walk.
   */
  async syncFromSap(
    tenantId: string,
    /** Null for scheduled runs — `AuditLog.userId` is nullable and means "not a person". */
    actorUserId: string | null,
    options?: { budgetMs?: number },
  ): Promise<SapSyncResult> {
    const budgetMs = options?.budgetMs ?? DEFAULT_BUDGET_MS;
    if (await sapStockPlacementService.inProgress(tenantId)) {
      return sapStockPlacementService.place(tenantId, actorUserId, budgetMs);
    }

    const result = await runSapSync(tenantId, serialNumberSyncEntity, actorUserId, options);
    if (!result.caughtUp) return result;

    // The registry is current; place the stock built on it. A failure to start (no saved
    // query, SAP down) is reported on the completed serial result rather than thrown.
    try {
      const placed = await sapStockPlacementService.place(tenantId, actorUserId, budgetMs);
      return {
        ...placed,
        notes: [
          `Serial numbers are up to date with SAP (${result.created.toLocaleString()} added, ` +
            `${result.removed.toLocaleString()} removed)`,
          ...(placed.notes ?? []),
        ],
        skipped: [...result.skipped, ...placed.skipped],
      };
    } catch (error) {
      return {
        ...result,
        notes: [
          `Stock was not placed from SAP: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }
  },
};
