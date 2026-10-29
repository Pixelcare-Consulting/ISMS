/**
 * Plain-language copy when SAP refuses the document on Supply Planning approval.
 * The review screen shows `summary` as why, `nextStep` as what to do, and
 * `detail` only when SAP's own text is still useful to support.
 */

const EXCHANGE_RATE_SUMMARY =
  "Today's US dollar rate is missing. The order cannot go through until that rate is set.";

const EXCHANGE_RATE_NEXT_STEP =
  "Ask the person who looks after SAP to set today's US dollar rate. Then choose Approve again on this same order.";

const GENERIC_SUMMARY = "SAP could not finish this order.";

const GENERIC_NEXT_STEP =
  "Ask the person who looks after SAP to fix the problem below. Then choose Approve again on this same order.";

export function describeSapOrderRejection(sapMessage: string | null | undefined): {
  summary: string;
  detail: string | null;
  nextStep: string;
} {
  const raw = sapMessage?.trim() ?? "";
  if (isUsdExchangeRateRejection(raw)) {
    return {
      summary: EXCHANGE_RATE_SUMMARY,
      detail: null,
      nextStep: EXCHANGE_RATE_NEXT_STEP,
    };
  }
  if (!raw || raw.toLowerCase() === GENERIC_SUMMARY.toLowerCase()) {
    return { summary: GENERIC_SUMMARY, detail: null, nextStep: GENERIC_NEXT_STEP };
  }
  return { summary: GENERIC_SUMMARY, detail: raw, nextStep: GENERIC_NEXT_STEP };
}

function isUsdExchangeRateRejection(message: string): boolean {
  const normalized = message.toLowerCase();
  if (normalized.includes("actualice el tipo de cambio")) return true;
  return normalized.includes("tipo de cambio") && normalized.includes("usd");
}

/** Thrown after the order is back on Pending Supply Planning. */
export class SapOrderPostRejectedError extends Error {
  readonly sapMessage: string | null;
  readonly updatedAt: string | null;

  constructor(sapMessage: string | null, updatedAt: Date | null) {
    super(describeSapOrderRejection(sapMessage).summary);
    this.name = "SapOrderPostRejectedError";
    this.sapMessage = sapMessage;
    this.updatedAt = updatedAt ? updatedAt.toISOString() : null;
  }
}
