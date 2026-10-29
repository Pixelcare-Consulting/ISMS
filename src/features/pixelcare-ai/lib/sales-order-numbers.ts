/**
 * Stored order numbers keep the hash: ITR#{YYYY}-{MM}-##### for consignment orders and
 * SO#… for outright ones (see nextSalesOrderNumber). Do not strip "#" before lookup.
 */
const SALES_ORDER_NUMBER_PATTERN = /(?<![A-Za-z0-9])(?:SO|ITR)#\d{4}-\d{2}-\d{5}(?!\d)/gi;
const CANONICAL_SALES_ORDER_NUMBER = /^(?:SO|ITR)#\d{4}-\d{2}-\d{5}$/;

export const MAX_ORDER_LOOKUPS = 10;

export function isCanonicalSalesOrderNumber(value: string): boolean {
  return CANONICAL_SALES_ORDER_NUMBER.test(value);
}

/** Keep "#" on full SO / ITR tokens, prefix upper-cased. Other text is trimmed only. */
export function normalizeSalesOrderToken(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 2 || trimmed.length > 80) return null;
  const match = /^(SO|ITR)#(\d{4})-(\d{2})-(\d{5})$/i.exec(trimmed);
  if (!match) return trimmed;
  return `${match[1].toUpperCase()}#${match[2]}-${match[3]}-${match[4]}`;
}

export function extractSalesOrderNumbers(text: string): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const numbers: string[] = [];
  for (const match of text.matchAll(SALES_ORDER_NUMBER_PATTERN)) {
    const token = match[0].replace(/^(so|itr)#/i, (prefix) => prefix.toUpperCase());
    if (seen.has(token)) continue;
    seen.add(token);
    numbers.push(token);
  }
  return numbers;
}

export function resolveOrderLookupQueries(input: {
  orderNumber?: string | null;
  orderNumbers?: readonly string[] | null;
  /** Numbers already extracted from the latest user message. They win over model args. */
  fromMessage?: readonly string[] | null;
}): { queries: string[]; truncated: boolean } {
  const seeded =
    input.fromMessage && input.fromMessage.length > 0
      ? input.fromMessage
      : [...(input.orderNumbers ?? []), ...(input.orderNumber ? [input.orderNumber] : [])];

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of seeded) {
    const normalized = normalizeSalesOrderToken(raw);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized);
  }
  return {
    queries: unique.slice(0, MAX_ORDER_LOOKUPS),
    truncated: unique.length > MAX_ORDER_LOOKUPS,
  };
}

export type ForcedFindOrderStatusChoice = {
  type: "tool";
  toolName: "findOrderStatus";
};

/**
 * First model step only. Later steps stay on automatic tool choice so the
 * model can answer from the lookup instead of calling the tool again.
 */
export function preparePixelcareOrderLookupStep(input: {
  stepNumber: number;
  salesOrderNumbers: readonly string[];
}): {
  toolChoice?: ForcedFindOrderStatusChoice;
  activeTools?: readonly ["findOrderStatus"];
} {
  if (input.stepNumber !== 0 || input.salesOrderNumbers.length === 0) return {};
  return {
    toolChoice: { type: "tool", toolName: "findOrderStatus" },
    activeTools: ["findOrderStatus"],
  };
}
