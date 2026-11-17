import { TO_FOLLOW_SERIAL_LABEL } from "@/features/sales/constants/to-follow-serial";
import { matchesTableSearch } from "@/utils/match-table-search";

interface MoneyLike {
  toString(): string;
}

/**
 * Fields the sales table already searches, loaded with each list line.
 * Status name and code are the STATUS column, passed in separately.
 */
export interface SalesListSearchSource {
  saleAmount: MoneyLike | null;
  amount: MoneyLike | null;
  modelPrice: MoneyLike | null;
  serialNumber: { serialNo: string } | null;
  packageType: { name: string } | null;
  brand: { name: string } | null;
  model: { skuCode: string; name: string } | null;
  sale: {
    id: string;
    transactionNo: string;
    customerName: string | null;
    atrStatus: string;
    branch: { name: string };
    stockSourceBranch: { name: string } | null;
    returnRequest: { status: string } | null;
  };
}

function saleAmountLabel(
  saleAmount: MoneyLike | null,
  amount: MoneyLike | null,
): string {
  const lineAmount = saleAmount ?? amount;
  return (lineAmount ?? 0).toString();
}

/** Same haystack as the sales table search box. */
export function matchesSalesListSearch(
  query: string,
  source: SalesListSearchSource,
  status: { name: string; code: string } | null,
): boolean {
  const modelLabel = source.model
    ? source.model.skuCode || source.model.name
    : null;
  return matchesTableSearch(query, [
    source.sale.id,
    source.sale.transactionNo,
    source.sale.customerName,
    source.packageType?.name,
    source.brand?.name,
    modelLabel,
    source.sale.branch.name,
    source.sale.stockSourceBranch?.name ?? source.sale.branch.name,
    saleAmountLabel(source.saleAmount, source.amount),
    source.modelPrice != null ? source.modelPrice.toString() : null,
    source.serialNumber?.serialNo ?? TO_FOLLOW_SERIAL_LABEL,
    status?.name,
    status?.code,
    source.sale.atrStatus,
    source.sale.returnRequest?.status,
  ]);
}
