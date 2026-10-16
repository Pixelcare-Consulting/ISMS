import { computeSugQty } from "@/features/pixelcare-ai/lib/sug";
import { zonedClock } from "@/features/pixelcare-ai/automations/schedule";

/** Shown on every proposal that has not created an order. */
export const PROPOSED_NOT_CREATED = "Proposed — not created";

/**
 * Order Analytics pre-fills quantity with SUG only for auto replenish.
 * Manual analytics starts each line at 0. Confirm uses this type with
 * `orderService.create` and does not add a status.
 */
export const REPLENISHMENT_ORDER_TYPE = "auto_replenish" as const;

export const REPLENISHMENT_ANALYTICS_HREF = "/orders/auto-replenish?tab=analytics";

/** Drafts and orders still waiting for approval. Finished statuses are rejected. */
export const REMINDER_STATUSES = [
  "draft",
  "pending_ps",
  "pending_tl",
  "pending_sp",
  "pending_logistics",
] as const;

export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export type SkuOrderStatus = "active" | "hold" | "retired";

export type ShelfGapSource = {
  modelId: string;
  sku: string;
  shelfMax: number;
  stk: number;
  modelStatus?: SkuOrderStatus | null;
};

/** Snapshot stored on a proposal. `sug` is always `computeSugQty(shelfMax, stk)`. */
export type ReplenishmentLine = {
  sku: string;
  modelId: string;
  shelfMax: number;
  stk: number;
  sug: number;
  exceptions: string[];
};

export type ProposalConfirmState = {
  status: "proposed" | "confirmed" | "superseded";
  orderId: string | null;
};

export type ConfirmDecision =
  | { kind: "missing" }
  | { kind: "closed" }
  | { kind: "return_existing"; orderId: string }
  | { kind: "create" };

export function automationLocalDay(now: Date, timeZone: string): string {
  return zonedClock(now, timeZone).date;
}

/** UTC midnight of a local calendar day so a `@db.Date` stores that day. */
export function localDayToDate(localDay: string): Date {
  return new Date(`${localDay}T00:00:00.000Z`);
}

export function buildReplenishmentLines(
  sources: readonly ShelfGapSource[],
  minSug = 1,
): ReplenishmentLine[] {
  const lines: ReplenishmentLine[] = [];
  for (const source of sources) {
    const sug = computeSugQty(source.shelfMax, source.stk);
    const exceptions: string[] = [];
    if (source.modelStatus === "hold" || source.modelStatus === "retired") {
      exceptions.push(`SKU is ${source.modelStatus} and cannot be ordered`);
    }
    if (sug > 0 && sug < minSug) {
      exceptions.push(`SUG ${sug} is below the minimum of ${minSug}`);
    }
    if (sug <= 0 && exceptions.length === 0) continue;
    lines.push({
      sku: source.sku,
      modelId: source.modelId,
      shelfMax: source.shelfMax,
      stk: source.stk,
      sug,
      exceptions,
    });
  }
  return lines;
}

export function orderableReplenishmentLines(
  lines: readonly ReplenishmentLine[],
): ReplenishmentLine[] {
  return lines.filter((line) => line.sug >= 1 && line.exceptions.length === 0);
}

/**
 * A second confirm returns the order already stored on the proposal.
 * Create is allowed only while the row is still proposed and has no order.
 */
export function decideProposalConfirm(proposal: ProposalConfirmState | null): ConfirmDecision {
  if (!proposal) return { kind: "missing" };
  if (proposal.orderId) return { kind: "return_existing", orderId: proposal.orderId };
  if (proposal.status === "proposed") return { kind: "create" };
  return { kind: "closed" };
}

export async function confirmOpenProposal(
  proposal: ProposalConfirmState | null,
  deps: {
    assertMayConfirm: () => Promise<void>;
    createDraft: () => Promise<{ id: string }>;
    reread: () => Promise<ProposalConfirmState | null>;
    attach: (orderId: string) => Promise<boolean>;
  },
): Promise<{ kind: "existing" | "created"; orderId: string }> {
  const decision = decideProposalConfirm(proposal);
  switch (decision.kind) {
    case "missing":
      throw new Error("Proposal not found.");
    case "closed":
      throw new Error("This proposal is no longer open.");
    case "return_existing":
      return { kind: "existing", orderId: decision.orderId };
    case "create": {
      await deps.assertMayConfirm();
      const order = await deps.createDraft();
      const attached = await deps.attach(order.id);
      if (attached) return { kind: "created", orderId: order.id };
      const retry = decideProposalConfirm(await deps.reread());
      if (retry.kind === "return_existing") {
        return { kind: "existing", orderId: retry.orderId };
      }
      throw new Error("The proposal changed before it could be confirmed.");
    }
    default: {
      const unreachable: never = decision;
      throw new Error(`Unhandled confirm decision ${String(unreachable)}`);
    }
  }
}

export function readMinSug(raw: unknown): number {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 1;
  const value = Number((raw as { minSug?: unknown }).minSug ?? 1);
  if (!Number.isInteger(value) || value < 1 || value > 9999) {
    throw new Error("Minimum SUG must be a whole number from 1 to 9999.");
  }
  return value;
}

export function parseReminderThresholds(raw: unknown): {
  olderThanDays: number;
  statuses: ReminderStatus[];
} {
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const older = Number(record.olderThanDays ?? 3);
  if (!Number.isInteger(older) || older < 1 || older > 365) {
    throw new Error("Reminder threshold must be a whole number of days from 1 to 365.");
  }
  const statuses = record.statuses;
  if (!Array.isArray(statuses) || statuses.length === 0) {
    throw new Error("Choose at least one order status for reminders.");
  }
  const parsed: ReminderStatus[] = [];
  for (const status of statuses) {
    if (typeof status !== "string" || !isReminderStatus(status)) {
      throw new Error(`Order status "${String(status)}" is not supported for reminders.`);
    }
    if (!parsed.includes(status)) parsed.push(status);
  }
  return { olderThanDays: older, statuses: parsed };
}

function isReminderStatus(status: string): status is ReminderStatus {
  return (REMINDER_STATUSES as readonly string[]).includes(status);
}

export function notificationDecision(input: {
  trigger: "schedule" | "manual" | "preview";
  alreadySentToday: boolean;
}): { send: false; reason: string } | { send: true } {
  if (input.trigger === "preview") {
    return { send: false, reason: "Preview does not send notifications." };
  }
  if (input.alreadySentToday) {
    return { send: false, reason: "Already notified for this local day." };
  }
  return { send: true };
}

export function assertKnownRecipients(
  requestedIds: readonly string[],
  foundIds: ReadonlySet<string>,
): void {
  if (requestedIds.length === 0) {
    throw new Error("No recipients configured.");
  }
  const missing = requestedIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new Error(`Recipient is not in this tenant: ${missing.join(", ")}`);
  }
}

export function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}
