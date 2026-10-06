import {
  sapStockPlacementService,
  type StockPlacementRun,
} from "@/features/inventory/services/sap-stock-placement.service";
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
 *
 * Run from the sync button it also places stock as it goes: each page, once written, is
 * looked up in SAP and its on-hand serials filed into Stock units / Warehouse stock — see
 * `sapStockPlacementService`.
 */

interface SerialRecord {
  serialNo: string;
  modelId: string;
  itemCode: string;
  /** OSRN.AbsEntry — what stock placement looks the page up by. */
  docEntry: number;
}

interface SerialContext {
  /** Item codes ISMS knows, so a serial can be linked to the model it belongs to. */
  modelIdBySku: Map<string, string>;
  /** Places each page's stock; null when this run only syncs the registry. */
  placement: StockPlacementRun | null;
}

function buildSerialSyncEntity(
  placement: StockPlacementRun | null,
): SapSyncEntity<SerialRecord, SerialContext> {
  return { ...serialSyncDescriptor, prepare: (tenantId) => prepareSerialSync(tenantId, placement) };
}

const serialSyncDescriptor: SapSyncEntity<SerialRecord, SerialContext> = {
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
    keys: (context) => [...context.modelIdBySku.keys()],
  },

  audit: { action: "serial_number.sap_sync", entityType: "SerialNumber" },

  parse(row, { modelIdBySku }) {
    const serialNo = sapText(row.SerialNumber);
    const itemCode = sapText(row.ItemCode);
    const docEntry = Number(row.DocEntry);

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

    return { record: { serialNo, modelId, itemCode, docEntry } };
  },

  async applyPage(tenantId, records, context) {
    const result = await serialNumberRepository.applySapSyncPage(
      tenantId,
      records.map(({ serialNo, modelId }) => ({ serialNo, modelId })),
    );
    if (!context?.placement) return result;
    // Placed straight after the write, so Stock units fill in batch by batch.
    const failures = await context.placement.placePage(records);
    return { ...result, failures: [...result.failures, ...failures] };
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
async function prepareSerialSync(
  tenantId: string,
  placement: StockPlacementRun | null,
): Promise<SerialContext> {
  const models = await serialNumberRepository.listSapSyncModelKeys(tenantId);
  if (models.length === 0) {
    throw new Error(
      "No product models in ISMS yet. Serial numbers link to a model, so sync Models " +
        "from SAP first (Settings → Master Data → Models), then run this again.",
    );
  }
  return {
    modelIdBySku: new Map(models.map((model) => [model.skuCode, model.id])),
    placement,
  };
}

/** The serial sync as the registry and the cron see it — without stock placement. */
export const serialNumberSyncEntity = buildSerialSyncEntity(null);

export const serialNumberSapSyncService = {
  /**
   * Pull serial master data from SAP into the ISMS registry, placing each page's on-hand
   * serials into Stock units and Warehouse stock as it is written.
   *
   * One call is a slice of the work, not necessarily all of it: at ~4M rows a full pass
   * takes several runs, and `caughtUp` says whether SAP has more. Stock appears batch by
   * batch rather than at the end. If placement cannot start (no SAP connection, the SAP
   * query cannot be created, STK missing), serials still sync and the result says why.
   */
  async syncFromSap(
    tenantId: string,
    /** Null for scheduled runs — `AuditLog.userId` is nullable and means "not a person". */
    actorUserId: string | null,
    options?: { budgetMs?: number },
  ): Promise<SapSyncResult> {
    let placement: StockPlacementRun | null = null;
    let placementError: string | null = null;
    try {
      placement = await sapStockPlacementService.beginRun(tenantId, actorUserId);
    } catch (error) {
      placementError = error instanceof Error ? error.message : String(error);
    }

    const result = await runSapSync(
      tenantId,
      buildSerialSyncEntity(placement),
      actorUserId,
      options,
    );

    if (!placement) {
      return { ...result, notes: [`Stock was not placed from SAP: ${placementError}`] };
    }
    const placed = await placement.finish();
    return {
      ...result,
      notes: [...(result.notes ?? []), ...placed.notes],
      skipped: [...result.skipped, ...placed.skipped],
    };
  },
};
