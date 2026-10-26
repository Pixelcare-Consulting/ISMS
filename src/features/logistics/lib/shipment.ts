/** Waybill and schedule saved by Logistics. Print uses the saved values only. */
export interface LogisticsShipment {
  waybillNo: string | null;
  courierName: string | null;
  /** Calendar date, ISO. */
  scheduledAt: string | null;
  scheduledByName: string | null;
}

export const EMPTY_SHIPMENT: LogisticsShipment = {
  waybillNo: null,
  courierName: null,
  scheduledAt: null,
  scheduledByName: null,
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True only after waybill, courier, and schedule date are all saved. */
export function shipmentIsReady(shipment: LogisticsShipment): boolean {
  return Boolean(shipment.waybillNo?.trim() && shipment.courierName?.trim() && shipment.scheduledAt);
}

/** `YYYY-MM-DD` for a date input. Empty when nothing is saved. */
export function scheduleDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/** UTC calendar date. Rejects empty and impossible days such as 31 February. */
export function parseScheduleDate(value: string): Date | null {
  const trimmed = value.trim();
  const match = DATE_ONLY.exec(trimmed);
  if (!match) return null;
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== trimmed) return null;
  return date;
}

export function formatScheduleDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-PH", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
