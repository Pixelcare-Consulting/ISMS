import { createHash } from "node:crypto";

import { SAP_NO_CONNECTION_MESSAGE } from "@/config/platform";
import { sapText } from "@/features/sap/services/sap-master-data";
import { fetchSapSerialsInWarehouse } from "@/features/sap/services/sap-onhand-stock";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { runSapSync, runSapTargetedSync } from "@/features/sap/services/sap-sync-engine";
import type { SapSyncEntity, SapSyncTarget } from "@/features/sap/types/sap-sync-entity";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { SERIAL_SYNC_TARGET_LABELS } from "@/features/serial-numbers/constants/serial-sync-target";
import type { SerialSyncTarget } from "@/features/serial-numbers/schemas/serial-number.schema";
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

/** What every page needs, loaded once per run. */
interface SerialSyncContext {
  /** Item codes ISMS knows, so a serial can be linked to the model it belongs to. */
  modelIdBySku: Map<string, string>;
  /** Warehouse codes ISMS has, which gate whether an on-hand serial may be written. */
  warehouseAllowList: ReadonlySet<string>;
}

export const serialNumberSyncEntity: SapSyncEntity<SerialRecord, SerialSyncContext> = {
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
    keys: ({ modelIdBySku }) => [...modelIdBySku.keys()],
  },

  audit: { action: "serial_number.sap_sync", entityType: "SerialNumber" },

  /**
   * `SerialNumber.modelId` is a required FK, so a serial cannot be stored until its item
   * exists in ISMS. Models number in the thousands, so this index is cheap to hold for a
   * whole run — unlike the serials themselves. The warehouse allow list is small too,
   * and loading it here rather than per page saves two queries on every page.
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
    return {
      modelIdBySku: new Map(models.map((model) => [model.skuCode, model.id])),
      warehouseAllowList: await loadMasterWarehouseAllowList(tenantId),
    };
  },

  parse(row, { modelIdBySku }) {
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
  async applyPage(tenantId, records, { warehouseAllowList }) {
    const { onHand, notOnHand } = await readSerialPageLocations(tenantId, records);
    const { writable, known, missing } = gateSerialPageByWarehouse(
      records,
      onHand,
      warehouseAllowList,
    );

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

/**
 * Serials SAP holds in these warehouses, plus the ones ISMS last saw there.
 *
 * Both halves matter: SAP's side finds serials that arrived since the last sync, and
 * ISMS's side finds serials that have since left, so their location is cleared or moved
 * rather than left pointing at a warehouse that no longer holds them. SAP's side is kept
 * to items ISMS carries; anything else could only come back as a skip.
 */
async function serialsInWarehouses(tenantId: string, codes: string[]): Promise<string[]> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) throw new Error(SAP_NO_CONNECTION_MESSAGE);

  const models = await serialNumberRepository.listSapSyncModelKeys(tenantId);
  const carried = new Set(models.map((model) => model.skuCode));

  const serials = new Set(await serialNumberRepository.listSerialNosAtSapWarehouses(tenantId, codes));
  // Sequential on purpose: SAP serialises requests on one session anyway.
  for (const code of codes) {
    for (const location of await fetchSapSerialsInWarehouse(creds, code)) {
      if (carried.has(location.itemCode)) serials.add(location.serialNo);
    }
  }
  return [...serials];
}

/** Keys the engine walks for `target`, and the SAP field they match. */
async function resolveTarget(
  tenantId: string,
  target: SerialSyncTarget,
): Promise<Pick<SapSyncTarget, "field" | "keys">> {
  const { kind, values } = target;
  switch (kind) {
    case "SERIAL":
      return { field: "SerialNumber", keys: values };
    case "MODEL":
      return {
        field: "ItemCode",
        keys: await serialNumberRepository.listSapItemCodesFor(tenantId, { modelIds: values }),
      };
    case "BRAND":
      return {
        field: "ItemCode",
        keys: await serialNumberRepository.listSapItemCodesFor(tenantId, { brandIds: values }),
      };
    case "BRANCH":
    case "WAREHOUSE": {
      const codes = await serialNumberRepository.listSapWarehouseCodesFor(
        tenantId,
        kind === "BRANCH" ? { branchIds: values } : { warehouseIds: values },
      );
      if (codes.length === 0) return { field: "SerialNumber", keys: [] };
      return { field: "SerialNumber", keys: await serialsInWarehouses(tenantId, codes) };
    }
  }
}

/**
 * `SERIAL:3:SN1,SN2,SN3#a1b2c3d4`. Short enough for an audit line, and the hash keeps two
 * different targets with the same preview from sharing a lock.
 */
function targetLabel(target: SerialSyncTarget): string {
  const sorted = [...target.values].sort();
  const hash = createHash("sha256").update(sorted.join("\n")).digest("hex").slice(0, 8);
  const preview = sorted.slice(0, 5).join(",");
  return `${target.kind}:${sorted.length}:${preview}${sorted.length > 5 ? ",…" : ""}#${hash}`;
}

export const serialNumberSapSyncService = {
  /** What the targeted sync picker offers. */
  listTargetOptions(tenantId: string) {
    return serialNumberRepository.listSapSyncTargetOptions(tenantId);
  },

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

  /**
   * Re-sync only the serials `target` names: specific serials, a model's or brand's
   * serials, or the serials in a branch's or warehouse's SAP warehouses.
   *
   * Same writes as a full sync, and the same warehouse gate, but it never moves the full
   * sync's place and never removes anything. Like the full sync it may take more than one
   * call; pass the previous result's `resume` back until `caughtUp` is true.
   */
  async syncTargetFromSap(
    tenantId: string,
    actorUserId: string | null,
    target: SerialSyncTarget,
    options?: { budgetMs?: number; resume?: string | null },
  ): Promise<SapSyncResult> {
    const { field, keys } = await resolveTarget(tenantId, target);
    if (keys.length === 0) {
      const what = SERIAL_SYNC_TARGET_LABELS[target.kind].toLowerCase();
      throw new Error(
        target.kind === "BRANCH" || target.kind === "WAREHOUSE"
          ? `No serial numbers found in SAP or ISMS for the selected ${what}.`
          : `None of the selected ${what} are in ISMS Master data, so there is nothing to sync.`,
      );
    }

    const result = await runSapTargetedSync(
      tenantId,
      serialNumberSyncEntity,
      { field, kind: "string", keys, label: targetLabel(target) },
      actorUserId,
      options,
    );
    const note = missingWarehouseNote(result);
    return note ? { ...result, notes: [...(result.notes ?? []), note] } : result;
  },
};
