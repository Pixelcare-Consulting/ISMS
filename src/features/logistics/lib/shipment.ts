/** Pull-out waybill and schedule saved by Logistics. Print uses the saved values only. */
export interface LogisticsShipment {
  waybillNo: string | null;
  courierName: string | null;
  /** Calendar date, ISO. */
  scheduledAt: string | null;
  scheduledByName: string | null;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True only after waybill, courier, and schedule date are all saved. */
export function shipmentIsReady(
  shipment: Pick<LogisticsShipment, "waybillNo" | "courierName" | "scheduledAt">,
): boolean {
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

const DATE_TIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** `YYYY-MM-DDTHH:mm` in Manila time for a datetime-local input. Empty when nothing is saved. */
export function manilaDateTimeInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 16);
}

/** Reads a datetime-local value as Manila time, whatever timezone the server runs in. */
export function parseManilaDateTime(value: string): Date | null {
  const trimmed = value.trim();
  if (!DATE_TIME_LOCAL.test(trimmed)) return null;
  const date = new Date(`${trimmed}:00+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  // Date rolls 31 February forward instead of rejecting it.
  if (manilaDateTimeInputValue(date.toISOString()) !== trimmed) return null;
  return date;
}

/** Manila calendar date of an instant, printed like a schedule date ("Nov 6, 2026"). */
export function formatManilaDate(iso: string | null): string {
  return formatScheduleDate(manilaDateTimeInputValue(iso).slice(0, 10) || null);
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
