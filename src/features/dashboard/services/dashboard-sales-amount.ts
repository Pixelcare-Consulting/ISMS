type MoneyInput = { toString(): string } | number | null | undefined;

export interface DashboardSaleAmountLine {
  modelPrice: MoneyInput;
  saleAmount: MoneyInput;
  amount: MoneyInput;
}

export interface DashboardBranchSaleLine extends DashboardSaleAmountLine {
  branchId: string;
  branchName: string;
}

export interface DashboardBranchSaleRank {
  id: string;
  name: string;
  value: number;
}

const TOP_BRANCH_LIMIT = 5;

function selectedMoney(line: DashboardSaleAmountLine): MoneyInput {
  if (line.modelPrice != null) return line.modelPrice;
  if (line.saleAmount != null) return line.saleAmount;
  return line.amount;
}

/** Whole cents so a month of lines does not drift before the final peso value. */
function moneyToCents(value: MoneyInput): number {
  if (value == null) return 0;
  const raw = (typeof value === "number" ? value.toFixed(2) : value.toString()).trim();
  if (!raw) return 0;
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [wholePart, fracPart = ""] = unsigned.split(".");
  const whole = Number(wholePart || "0");
  if (!Number.isFinite(whole)) return 0;
  const fracDigits = fracPart.replace(/\D/g, "");
  const frac = Number((fracDigits + "00").slice(0, 2));
  if (!Number.isFinite(frac)) return 0;
  const cents = whole * 100 + frac;
  return negative ? -cents : cents;
}

function centsToAmount(cents: number): number {
  return cents / 100;
}

/**
 * Price-list model amount for one sale line.
 * Lines encoded before model price existed fall back to sale amount, then amount.
 */
export function dashboardSaleLineAmount(line: DashboardSaleAmountLine): number {
  return centsToAmount(moneyToCents(selectedMoney(line)));
}

export function sumDashboardSaleAmounts(lines: DashboardSaleAmountLine[]): number {
  const cents = lines.reduce(
    (sum, line) => sum + moneyToCents(selectedMoney(line)),
    0,
  );
  return centsToAmount(cents);
}

/** Same model-amount total as the month sale-amount card, highest first. */
export function rankTopBranchesByDashboardSaleAmount(
  lines: DashboardBranchSaleLine[],
  limit = TOP_BRANCH_LIMIT,
): DashboardBranchSaleRank[] {
  const byBranch = new Map<string, { name: string; cents: number }>();

  for (const line of lines) {
    const name = line.branchName.trim() || "Unknown branch";
    const current = byBranch.get(line.branchId) ?? { name, cents: 0 };
    current.cents += moneyToCents(selectedMoney(line));
    byBranch.set(line.branchId, current);
  }

  return [...byBranch.entries()]
    .map(([id, row]) => ({
      id,
      name: row.name,
      value: centsToAmount(row.cents),
    }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, limit);
}
