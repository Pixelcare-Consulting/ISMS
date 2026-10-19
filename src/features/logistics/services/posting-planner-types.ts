/** Closed inventory codes from the seeded inventory system list. */
export type InventoryCode = "DIT" | "STK" | "SLD" | "OFS" | "RSV" | "DEF" | "FPO" | "FW";

/** Codes a transfer or pull-out may hold and later restore. */
export type HoldCode = "STK" | "DEF";

export type PlanFailure = { ok: false; error: string };

export interface AllocatableSerial {
  serialNumberId: string;
  serialNo?: string;
  modelId: string;
  inventoryCode: InventoryCode | null;
  pendingDefectInspection: boolean;
  frozenInStockCount: boolean;
  /** Other open transfer or pull-out documents already holding this serial. */
  openDocumentIds: readonly string[];
}

export const OPEN_TRANSFER_STATUS_CODES = [
  "pending_tl",
  "requested",
  "approved",
  "for_transfer",
  "in_transit",
] as const;

export const OPEN_PULLOUT_STATUS_CODES = [
  "pending_tl",
  "requested",
  "approved",
  "for_pullout",
  "pending_logistics",
  "in_transit",
] as const;

export function isHoldCode(code: InventoryCode | null): code is HoldCode {
  return code === "STK" || code === "DEF";
}

export function uniqueSerialIds(ids: readonly string[]): string[] | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return null;
    seen.add(id);
  }
  return [...ids];
}

function serialLabel(serial: { serialNo?: string; serialNumberId: string }): string {
  return serial.serialNo ?? "This serial";
}

function blockedInventoryMessage(code: Exclude<InventoryCode, HoldCode>): string {
  switch (code) {
    case "SLD":
      return "is sold";
    case "OFS":
      return "is officially sold";
    case "RSV":
      return "is already reserved";
    case "DIT":
      return "is already in transit";
    case "FPO":
      return "is already waiting for pull-out";
    case "FW":
      return "is marked to follow";
    default: {
      const unreachable: never = code;
      return unreachable;
    }
  }
}

/** Stock or defective units that are free to put on a new request. */
export function classifyAllocation(serial: AllocatableSerial): { ok: true; priorCode: HoldCode } | PlanFailure {
  const label = serialLabel(serial);
  if (serial.pendingDefectInspection) {
    return { ok: false, error: `${label} is pending defect inspection` };
  }
  if (serial.frozenInStockCount) {
    return { ok: false, error: `${label} is frozen in a stock count` };
  }
  if (serial.openDocumentIds.length > 0) {
    return { ok: false, error: `${label} is already on an open transfer or pull-out` };
  }

  const code = serial.inventoryCode;
  if (code === "STK" || code === "DEF") {
    return { ok: true, priorCode: code };
  }
  if (code === null) {
    return { ok: false, error: `${label} is not available at this branch` };
  }
  switch (code) {
    case "SLD":
    case "OFS":
    case "RSV":
    case "DIT":
    case "FPO":
    case "FW":
      return { ok: false, error: `${label} ${blockedInventoryMessage(code)} and cannot be allocated` };
    default: {
      const unreachable: never = code;
      return unreachable;
    }
  }
}
