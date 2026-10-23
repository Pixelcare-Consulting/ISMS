import {
  partitionOnHandByMaster,
  type OnHandWarehouseSerial,
} from "@/features/serial-numbers/services/serial-stock-replicate";
import {
  ensureSapOnHandQuery,
  fetchSapSerialLocations,
  type SapSerialLocation,
} from "@/features/sap/services/sap-onhand-stock";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { logger } from "@/lib/shared/logger";

/** One serial just parsed from a sync page. `docEntry` is OSRN.AbsEntry. */
export interface SerialOnHandRow {
  serialNo: string;
  modelId: string;
  itemCode: string;
  docEntry: number;
}

/**
 * Widest AbsEntry window one saved-query call may cover.
 *
 * A sync page is ordered by DocEntry but only contains the items ISMS holds, so the
 * ids on one page can sit far apart. One query from the smallest to the largest would
 * also return every other item's on-hand serial in that gap, and a large enough gap
 * fails the read — which then stops on-hand updates for the rest of the run.
 */
const MAX_ON_HAND_QUERY_SPAN = 2000;

/** AbsEntry bounds for the saved query: `(lo, hi]`. */
export function onHandDocRange(docEntries: number[]): { lo: number; hi: number } | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const value of docEntries) {
    if (!Number.isFinite(value) || value < 1) continue;
    if (value < lo) lo = value;
    if (value > hi) hi = value;
  }
  if (!Number.isFinite(lo)) return null;
  return { lo: Math.floor(lo) - 1, hi: Math.floor(hi) };
}

/**
 * Saved-query windows that cover `docEntries` without bridging a wide gap.
 * Each window is `(lo, hi]`.
 */
export function onHandDocRanges(docEntries: number[]): { lo: number; hi: number }[] {
  const sorted = [
    ...new Set(
      docEntries
        .filter((value) => Number.isFinite(value) && value >= 1)
        .map((value) => Math.floor(value)),
    ),
  ].sort((left, right) => left - right);

  const ranges: { lo: number; hi: number }[] = [];
  let cluster: number[] = [];
  const flush = () => {
    const range = onHandDocRange(cluster);
    if (range) ranges.push(range);
    cluster = [];
  };

  for (const value of sorted) {
    const start = cluster[0];
    if (start !== undefined && value - start > MAX_ON_HAND_QUERY_SPAN) flush();
    cluster.push(value);
  }
  flush();
  return ranges;
}

/**
 * Which of this page's serials SAP holds on hand.
 *
 * A location counts only when both the serial and its item are on the page, so a
 * serial of some other item that happens to fall in the same id range is ignored.
 * The same serial in two warehouses still counts once.
 */
export function serialsOnHandFromLocations(
  page: { serialNo: string; itemCode: string }[],
  locations: Pick<SapSerialLocation, "serialNo" | "itemCode" | "warehouseCode">[],
): { onHand: { serialNo: string; warehouseCode: string }[]; notOnHand: string[] } {
  const itemBySerial = new Map(page.map((row) => [row.serialNo, row.itemCode]));
  const warehouseBySerial = new Map<string, string>();
  for (const location of locations) {
    const warehouseCode = location.warehouseCode.trim();
    if (!warehouseCode) continue;
    if (itemBySerial.get(location.serialNo) !== location.itemCode) continue;
    const current = warehouseBySerial.get(location.serialNo);
    // One warehouse per serial. The earlier code is stable if SAP lists two.
    if (current === undefined || warehouseCode < current) {
      warehouseBySerial.set(location.serialNo, warehouseCode);
    }
  }

  const onHand: { serialNo: string; warehouseCode: string }[] = [];
  const notOnHand: string[] = [];
  const seen = new Set<string>();
  for (const row of page) {
    if (seen.has(row.serialNo)) continue;
    seen.add(row.serialNo);
    const warehouseCode = warehouseBySerial.get(row.serialNo);
    if (warehouseCode) onHand.push({ serialNo: row.serialNo, warehouseCode });
    else notOnHand.push(row.serialNo);
  }
  return { onHand, notOnHand };
}

/**
 * Where SAP holds each serial on a sync page. Throws when the location read is
 * unavailable: the sync only takes serials whose warehouse ISMS has, so it cannot
 * write a page whose warehouses it does not know.
 */
export async function readSerialPageLocations(
  tenantId: string,
  records: SerialOnHandRow[],
): Promise<{ onHand: OnHandWarehouseSerial[]; notOnHand: string[] }> {
  const page = records.filter((row) => Number.isInteger(row.docEntry) && row.docEntry > 0);
  if (page.length < records.length) {
    throw new Error(
      `${records.length - page.length} SAP serial rows had no serial id, so their warehouse ` +
        "could not be read. Nothing on this page was saved.",
    );
  }
  const ranges = onHandDocRanges(page.map((row) => row.docEntry));
  if (ranges.length === 0) return { onHand: [], notOnHand: [] };

  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) throw new Error("SAP is not connected");

  try {
    await ensureSapOnHandQuery(creds);
    // Sequential on purpose: SAP serialises requests on one session anyway.
    const locations: SapSerialLocation[] = [];
    for (const range of ranges) {
      locations.push(...(await fetchSapSerialLocations(creds, range.lo, range.hi)));
    }
    return serialsOnHandFromLocations(page, locations);
  } catch (error) {
    logger.error({ err: error, tenantId }, "SAP serial warehouses could not be read");
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Serial warehouses could not be read from SAP: ${message}`);
  }
}

/** Skip reason for serials SAP holds in a warehouse ISMS does not have yet. */
export const SERIAL_WAREHOUSE_MISSING_REASON =
  "SAP warehouse is not in ISMS yet. Sync Warehouses (Settings → Warehouses, or " +
  "Branches for a branch's own warehouse) first, then run this sync again";

/**
 * Split a page by where SAP holds each serial:
 * - `writable`: not on hand anywhere, or on hand in a warehouse ISMS has
 * - `known`: the on-hand rows among those, which link the serial to its warehouse
 * - `missing`: on hand in a warehouse ISMS lacks; neither created nor updated
 */
export function gateSerialPageByWarehouse<T extends { serialNo: string }>(
  records: T[],
  onHand: OnHandWarehouseSerial[],
  allowList: ReadonlySet<string>,
): { writable: T[]; known: OnHandWarehouseSerial[]; missing: OnHandWarehouseSerial[] } {
  const { known, unknown } = partitionOnHandByMaster(onHand, allowList);
  const blocked = new Set(unknown.map((row) => row.serialNo));
  return {
    writable: records.filter((record) => !blocked.has(record.serialNo)),
    known,
    missing: unknown,
  };
}
