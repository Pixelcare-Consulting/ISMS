import { serialNumberRepository } from "@/features/serial-numbers/repositories/serial-number.repository";
import {
  loadMasterWarehouseAllowList,
  partitionOnHandByMaster,
  replicateOnHandSerialsToStk,
} from "@/features/serial-numbers/services/serial-stock-replicate";
import {
  ensureSapOnHandQuery,
  fetchSapSerialLocations,
  type SapSerialLocation,
} from "@/features/sap/services/sap-onhand-stock";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";
import { logger } from "@/lib/shared/logger";

/** One serial just written by a sync page. `docEntry` is OSRN.AbsEntry. */
export interface SerialOnHandRow {
  serialNo: string;
  modelId: string;
  itemCode: string;
  docEntry: number;
}

interface ReadySession {
  creds: SapServiceLayerCredentials;
}

interface BlockedSession {
  error: string;
}

/**
 * One run's on-hand read. A failure is remembered so later pages of the same run
 * do not keep calling a SAP query that is already unavailable.
 */
const sessions = new Map<string, ReadySession | BlockedSession>();

/** Drop any note from a previous run before a new sync slice starts. */
export function beginSerialOnHandRun(tenantId: string): void {
  sessions.delete(tenantId);
}

/** Why this run stopped updating on-hand flags, if it did. */
export function serialOnHandBlockReason(tenantId: string): string | null {
  const session = sessions.get(tenantId);
  return session && "error" in session ? session.error : null;
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

async function sessionFor(tenantId: string): Promise<ReadySession | BlockedSession> {
  const existing = sessions.get(tenantId);
  if (existing) return existing;

  try {
    const creds = await sapServiceLayerService.getCredentials(tenantId);
    if (!creds) throw new Error("SAP is not connected");
    await ensureSapOnHandQuery(creds);
    const ready: ReadySession = { creds };
    sessions.set(tenantId, ready);
    return ready;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const blocked: BlockedSession = { error: message };
    sessions.set(tenantId, blocked);
    logger.error({ err: error, tenantId }, "SAP on-hand counts were not updated");
    return blocked;
  }
}

function block(tenantId: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  sessions.set(tenantId, { error: message });
  logger.error({ err: error, tenantId }, "SAP on-hand counts were not updated");
}

/**
 * After a sync page is written, mark its serials on hand or clear the flag.
 * Never throws: the registry sync finishes either way.
 */
export async function stampSerialPageOnHand(
  tenantId: string,
  records: SerialOnHandRow[],
): Promise<void> {
  const page = records.filter((row) => Number.isInteger(row.docEntry) && row.docEntry > 0);
  if (page.length === 0) {
    if (records.length > 0) {
      logger.warn(
        { tenantId, records: records.length },
        "Serial page had no SAP serial id, so on-hand was not stamped",
      );
    }
    return;
  }
  if (serialOnHandBlockReason(tenantId)) return;

  const ranges = onHandDocRanges(page.map((row) => row.docEntry));
  if (ranges.length === 0) return;

  const session = await sessionFor(tenantId);
  if ("error" in session) return;

  try {
    const locations: SapSerialLocation[] = [];
    for (const range of ranges) {
      const found = await fetchSapSerialLocations(session.creds, range.lo, range.hi);
      locations.push(...found);
    }
    const { onHand, notOnHand } = serialsOnHandFromLocations(page, locations);
    const allowList = await loadMasterWarehouseAllowList(tenantId);
    const { known, unknownSerialNos } = partitionOnHandByMaster(onHand, allowList);
    const cleared = [...notOnHand, ...unknownSerialNos];
    const modelIds = [...new Set(page.map((row) => row.modelId))];
    await serialNumberRepository.setSapOnHandFlags(tenantId, modelIds, known, cleared);
    await replicateOnHandSerialsToStk(tenantId, known);
  } catch (error) {
    block(tenantId, error);
  }
}
