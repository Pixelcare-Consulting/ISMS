/**
 * Location stock-in decisions. A new serial is registered and placed. The same
 * location and the same model is a no-op. Any other current placement is refused
 * before a row is written. A location outside the chosen warehouse is refused first.
 */

export interface StockInExistingSerial {
  id: string;
  serialNo: string;
  modelId: string;
  tenantId: string;
  deleted: boolean;
}

export type StockInOccupancyTable = "branch" | "warehouse" | "service_center";

export interface StockInOccupancy {
  serialNumberId: string;
  table: StockInOccupancyTable;
  warehouseLocationId: string | null;
  place: string;
}

export interface WarehouseStockInPlan {
  /** Serial numbers that do not exist yet. The writer creates them, then places them. */
  createSerialNos: string[];
  /** Existing serials with no current placement. */
  placeExistingIds: string[];
  skippedSerialNos: string[];
}

export type WarehouseStockInPlanResult =
  | { ok: true; plan: WarehouseStockInPlan }
  | { ok: false; error: string };

/** One serial per line, or separated by commas or spaces. Blanks and repeats are dropped. */
export function parseStockInSerialNos(raw: string): string[] {
  const seen = new Set<string>();
  const serialNos: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const serialNo = part.trim();
    if (!serialNo || seen.has(serialNo)) continue;
    seen.add(serialNo);
    serialNos.push(serialNo);
  }
  return serialNos;
}

function occupancyError(serialNo: string, rows: readonly StockInOccupancy[]): string {
  const places = rows.map((row) => row.place).join(", ");
  return `${serialNo} is already at ${places}.`;
}

export function planWarehouseStockIn(input: {
  warehouseId: string;
  locationWarehouseId: string | null;
  locationId: string;
  modelId: string;
  tenantId: string;
  serialNos: readonly string[];
  existing: readonly StockInExistingSerial[];
  occupancy: readonly StockInOccupancy[];
}): WarehouseStockInPlanResult {
  if (!input.locationWarehouseId || input.locationWarehouseId !== input.warehouseId) {
    return { ok: false, error: "That location is not in this warehouse." };
  }
  if (!input.modelId.trim()) {
    return { ok: false, error: "Choose a model." };
  }
  if (!input.locationId.trim()) {
    return { ok: false, error: "That location is not in this warehouse." };
  }

  const serialNos = [...new Set(input.serialNos.map((serial) => serial.trim()).filter(Boolean))];
  if (serialNos.length === 0) {
    return { ok: false, error: "Enter at least one serial number." };
  }

  const byNo = new Map(input.existing.map((row) => [row.serialNo, row]));
  const occupancyBySerial = new Map<string, StockInOccupancy[]>();
  for (const row of input.occupancy) {
    const current = occupancyBySerial.get(row.serialNumberId) ?? [];
    current.push(row);
    occupancyBySerial.set(row.serialNumberId, current);
  }

  const createSerialNos: string[] = [];
  const placeExistingIds: string[] = [];
  const skippedSerialNos: string[] = [];

  for (const serialNo of serialNos) {
    const row = byNo.get(serialNo);
    if (!row) {
      createSerialNos.push(serialNo);
      continue;
    }
    if (row.tenantId !== input.tenantId) {
      return { ok: false, error: `${serialNo} is not in this company.` };
    }
    if (row.modelId !== input.modelId) {
      return { ok: false, error: `${serialNo} already belongs to a different model.` };
    }
    if (row.deleted) {
      return { ok: false, error: `${serialNo} is retired and cannot be stocked in.` };
    }

    const occupied = occupancyBySerial.get(row.id) ?? [];
    if (occupied.length === 0) {
      placeExistingIds.push(row.id);
      continue;
    }

    const sameLocation =
      occupied.length === 1 &&
      occupied[0]?.table === "warehouse" &&
      occupied[0].warehouseLocationId === input.locationId;
    if (sameLocation) {
      skippedSerialNos.push(serialNo);
      continue;
    }

    return { ok: false, error: occupancyError(serialNo, occupied) };
  }

  return {
    ok: true,
    plan: { createSerialNos, placeExistingIds, skippedSerialNos },
  };
}
