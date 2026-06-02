const DAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface DeliverySchedule {
  days?: string[];
}

export function parseDeliverySchedule(raw: unknown): DeliverySchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const days = (raw as DeliverySchedule).days;
  if (!Array.isArray(days)) return null;
  return { days: days.filter((d): d is string => typeof d === "string") };
}

export function isDeliveryDateOnSchedule(date: Date, schedule: DeliverySchedule | null): boolean {
  if (!schedule?.days?.length) return true;
  const allowed = new Set(
    schedule.days.map((d) => DAY_MAP[d]).filter((n): n is number => n !== undefined),
  );
  if (allowed.size === 0) return true;
  return allowed.has(date.getDay());
}

export function nextScheduledDeliveryDate(
  from: Date,
  schedule: DeliverySchedule | null,
): Date | null {
  if (!schedule?.days?.length) return null;
  const allowed = new Set(
    schedule.days.map((d) => DAY_MAP[d]).filter((n): n is number => n !== undefined),
  );
  if (allowed.size === 0) return null;

  const candidate = new Date(from);
  candidate.setHours(0, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    if (allowed.has(candidate.getDay())) return new Date(candidate);
    candidate.setDate(candidate.getDate() + 1);
  }
  return null;
}

export function getDeliveryDueDateWarning(
  dateStr: string,
  scheduleRaw: unknown,
): string | null {
  if (!dateStr) return null;
  const schedule = parseDeliverySchedule(scheduleRaw);
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Invalid delivery date.";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) {
    const next = nextScheduledDeliveryDate(today, schedule);
    return next
      ? `Due date is in the past. On approve, it will auto-reschedule to ${next.toISOString().slice(0, 10)}.`
      : "Due date is in the past.";
  }

  if (!isDeliveryDateOnSchedule(date, schedule)) {
    const next = nextScheduledDeliveryDate(date < today ? today : date, schedule);
    const dayList = schedule?.days?.join(", ") ?? "none configured";
    return next
      ? `Outside branch delivery window (${dayList}). On approve, auto-reschedule to ${next.toISOString().slice(0, 10)}.`
      : `Outside branch delivery window (${dayList}). No schedule days configured to auto-reschedule.`;
  }

  return null;
}

/** Process A — out-of-delivery window: snap to next branch delivery day when configured. */
export function resolveDeliveryDueDate(
  dateStr: string | undefined,
  scheduleRaw: unknown,
): { dueDate: Date | null; rescheduled: boolean; rescheduledFrom?: string } {
  if (!dateStr) return { dueDate: null, rescheduled: false };

  const schedule = parseDeliverySchedule(scheduleRaw);
  const requested = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(requested.getTime())) return { dueDate: null, rescheduled: false };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (isDeliveryDateOnSchedule(requested, schedule) && requested >= today) {
    return { dueDate: requested, rescheduled: false };
  }

  const anchor = requested < today ? today : requested;
  const next = nextScheduledDeliveryDate(anchor, schedule);
  if (!next) return { dueDate: requested, rescheduled: false };

  return {
    dueDate: next,
    rescheduled: true,
    rescheduledFrom: dateStr,
  };
}
