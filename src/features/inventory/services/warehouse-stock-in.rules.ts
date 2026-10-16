/**
 * Location stock-in decisions. New serials are registered and placed. A serial
 * already in warehouse stock is skipped. A location that is not in the chosen
 * warehouse is rejected before anything is written.
 */

export interface StockInExistingSerial {
  id: string;
  serialNo: string;
  modelId: string;
  deleted: boolean;
}

export interface WarehouseStockInPlan {
  /** Serial numbers that do not exist yet. The writer creates them, then places them. */
  createSerialNos: string[];
  /** Existing serials that are not already in warehouse stock. */
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

export function planWarehouseStockIn(input: {
  warehouseId: string;
  locationWarehouseId: string | null;
  modelId: string;
  serialNos: readonly string[];
  existing: readonly StockInExistingSerial[];
  warehouseSerialIds: readonly string[];
}): WarehouseStockInPlanResult {
  if (!input.locationWarehouseId || input.locationWarehouseId !== input.warehouseId) {
    return { ok: false, error: "That location is not in this warehouse." };
  }
  if (!input.modelId.trim()) {
    return { ok: false, error: "Choose a model." };
  }

  const serialNos = [
    ...new Set(input.serialNos.map((serial) => serial.trim()).filter(Boolean)),
  ];
  if (serialNos.length === 0) {
    return { ok: false, error: "Enter at least one serial number." };
  }

  const byNo = new Map(input.existing.map((row) => [row.serialNo, row]));
  const inWarehouse = new Set(input.warehouseSerialIds);
  const createSerialNos: string[] = [];
  const placeExistingIds: string[] = [];
  const skippedSerialNos: string[] = [];

  for (const serialNo of serialNos) {
    const row = byNo.get(serialNo);
    if (!row) {
      createSerialNos.push(serialNo);
      continue;
    }
    if (row.modelId !== input.modelId) {
      return { ok: false, error: `${serialNo} already belongs to a different model.` };
    }
    if (row.deleted) {
      return { ok: false, error: `${serialNo} is retired and cannot be stocked in.` };
    }
    if (inWarehouse.has(row.id)) {
      skippedSerialNos.push(serialNo);
      continue;
    }
    placeExistingIds.push(row.id);
  }

  return {
    ok: true,
    plan: { createSerialNos, placeExistingIds, skippedSerialNos },
  };
}
