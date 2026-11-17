import type { CurrentPlacement } from "@/features/inventory/services/serial-placement";

/**
 * Pure rules for the service-center order Check SAP: a SAP user copies the order's SO to a
 * DR, and ISMS turns that DR into an SC delivery whose serials arrive DIT and are accepted
 * to STK. Kept free of I/O so they are unit tested.
 */

/** Approved SC orders one Check SAP run looks at, newest first. */
export const SC_SAP_CHECK_ORDERS_PER_RUN = 100;
/** SOs whose DRs are looked up in one SAP call. */
export const SC_SAP_CHECK_BATCH = 20;

/** The ISMS delivery number for a DR: DocEntry is unique per DR, so the number is too. */
export function scDeliveryNoForDr(docEntry: number): string {
  return `SCD-DR${docEntry}`;
}

/**
 * Which current rows a serial on a DR replaces when it lands at an SC location. SAP is the
 * source of truth: the serial left the SAP warehouse, so ISMS's warehouse row goes. A row
 * already at this SC location is reused. Anything else (a branch, another SC location)
 * means ISMS disagrees with SAP, so the DR is stopped for a person to look at.
 */
export function scPlacementsToReplace(
  placements: readonly CurrentPlacement[],
  serviceCenterLocationId: string,
): { warehouseRowIds: string[]; blocked: CurrentPlacement[] } {
  const warehouseRowIds: string[] = [];
  const blocked: CurrentPlacement[] = [];
  for (const row of placements) {
    if (row.table === "warehouse") warehouseRowIds.push(row.id);
    else if (row.table === "service_center" && row.serviceCenterLocationId === serviceCenterLocationId) continue;
    else blocked.push(row);
  }
  return { warehouseRowIds, blocked };
}

/** "SN1 is at Branch A in ISMS; SN2 is at …" for a DR or accept that cannot go ahead. */
export function blockedPlacementMessage(blocked: readonly CurrentPlacement[]): string {
  return blocked.map((row) => `${row.serialNo} is at ${row.place} in ISMS`).join("; ");
}

/**
 * The SC location a DR's serials go to: the order's own, else the center's only location.
 * Null when the center has several and the order named none; Accept then asks for one.
 */
export function scDeliveryLocationId(
  orderLocationId: string | null,
  centerLocationIds: readonly string[],
): string | null {
  if (orderLocationId) return orderLocationId;
  return centerLocationIds.length === 1 ? (centerLocationIds[0] ?? null) : null;
}

/** Delivery status after an accept: every DR serial accepted, or only some. */
export function scDeliveryStatusAfterAccept(lines: readonly { acceptedAt: Date | null }[]): "accepted" | "partial" {
  return lines.every((line) => line.acceptedAt !== null) ? "accepted" : "partial";
}

/** What one Check SAP run did. */
export interface ScOrderSapCheckResult {
  ordersChecked: number;
  deliveriesCreated: number;
  serialCount: number;
  /** One line per DR or order that could not be applied, with SAP's or ISMS's reason. */
  problems: string[];
}

export interface ScOrderSapCheckSummary {
  tone: "success" | "info" | "warning";
  title: string;
  description?: string;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/** Toast text for a run. Problems are never dropped. */
export function summarizeScOrderSapCheck(result: ScOrderSapCheckResult): ScOrderSapCheckSummary {
  const problems = result.problems.length > 0 ? result.problems.join(" ") : undefined;
  if (result.deliveriesCreated > 0) {
    const added = `Added ${plural(result.deliveriesCreated, "delivery", "deliveries")} from SAP (${plural(result.serialCount, "unit")})`;
    if (!problems) {
      return { tone: "success", title: added, description: "Open a delivery to receive its units." };
    }
    // Part of the run failed: the title says so, not only what went in.
    return {
      tone: "warning",
      title: `${added}. ${plural(result.problems.length, "SAP delivery", "SAP deliveries")} not added`,
      description: `Not added: ${problems}`,
    };
  }
  if (result.problems.length > 0) {
    return { tone: "warning", title: "Some SAP deliveries could not be added", description: problems };
  }
  if (result.ordersChecked === 0) {
    return { tone: "info", title: "No approved orders are waiting for a SAP delivery" };
  }
  return { tone: "info", title: "No new SAP deliveries" };
}
