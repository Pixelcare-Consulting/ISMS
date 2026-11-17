import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import {
  canonicalSalesListStatusCode,
  SALES_ATR_LIST_CODES,
  SALES_LIST_STATUS_CODES,
} from "@/features/sales/constants/sales-list-status";
import { salesRepository } from "@/features/sales/repositories/sales.repository";
import { matchesSalesListSearch } from "@/features/sales/utils/sales-list-search";
import {
  loadSalesAtrCodesByCode,
  resolveListedLineStatus,
  resolveToFollowStatusCode,
  type SaleStatusCodeRef,
} from "@/features/sales/utils/resolve-line-status";
import type { SalesLineStatusSource } from "@/features/sales/services/sales-list.service";
import type { KpiStatusCount } from "@/lib/kpi-cards";

const SALE_STATUS_FALLBACK: Record<string, string> = {
  SLD: "Sold",
  OFS: "Official Sold",
  FW: "TO FOLLOW",
};

/** Card order for Sales & ATR steps that have at least one row. */
const SALES_ATR_CARD_ORDER = [
  ...SALES_ATR_LIST_CODES,
  "service_returned",
  "service_replaced",
] as const;

export interface SalesKpis {
  totalLines: number;
  statuses: KpiStatusCount[];
}

function salesAtrCardRank(code: string): number {
  const index = SALES_ATR_CARD_ORDER.indexOf(
    code as (typeof SALES_ATR_CARD_ORDER)[number],
  );
  return index === -1 ? SALES_ATR_CARD_ORDER.length : index;
}

/**
 * Sold, Official Sold, and TO FOLLOW always have a card.
 * Other resolved statuses (the Sales & ATR step the table shows) are added
 * only when at least one line counts toward them.
 */
export function assembleSalesKpiStatuses(
  inventoryCodes: Array<{ code: string; name: string; color: string | null }>,
  lines: Array<SaleStatusCodeRef | null>,
): KpiStatusCount[] {
  const buckets = new Map<
    string,
    { name: string; color: string | null; count: number }
  >();
  for (const status of lines) {
    if (!status) continue;
    const code = canonicalSalesListStatusCode(status.code);
    const existing = buckets.get(code);
    if (existing) {
      existing.count += 1;
      continue;
    }
    buckets.set(code, {
      name: status.name,
      color: status.color,
      count: 1,
    });
  }

  const statuses: KpiStatusCount[] = SALES_LIST_STATUS_CODES.map((code) => {
    const bucket = buckets.get(code);
    const meta = inventoryCodes.find((row) => row.code.toUpperCase() === code);
    return {
      code,
      name: bucket?.name ?? meta?.name ?? SALE_STATUS_FALLBACK[code] ?? code,
      count: bucket?.count ?? 0,
      color: bucket?.color ?? meta?.color ?? null,
    };
  });

  const inventoryCodesShown = new Set<string>(SALES_LIST_STATUS_CODES);
  const extras = [...buckets.entries()]
    .filter(([code, bucket]) => bucket.count > 0 && !inventoryCodesShown.has(code))
    .sort(
      (left, right) =>
        salesAtrCardRank(left[0]) - salesAtrCardRank(right[0]) ||
        left[0].localeCompare(right[0]),
    );

  for (const [code, bucket] of extras) {
    statuses.push({
      code,
      name: bucket.name,
      count: bucket.count,
      color: bucket.color,
    });
  }

  return statuses;
}

/** Status cards for any set of sale-line status sources (branch or service center). */
export async function computeSalesKpis(
  tenantId: string,
  sources: SalesLineStatusSource[],
  q?: string,
): Promise<SalesKpis> {
  const query = q?.trim() ?? "";
  const [inventoryCodes, toFollowStatus, salesAtrCodes] = await Promise.all([
    reasonStatusRepository.listActiveCodesByCategory(tenantId, "inventory_system"),
    resolveToFollowStatusCode(tenantId),
    loadSalesAtrCodesByCode(tenantId),
  ]);

  const resolvedLines: Array<SaleStatusCodeRef | null> = [];
  let totalLines = 0;
  for (const source of sources) {
    const status = resolveListedLineStatus(
      source,
      source.sale,
      toFollowStatus,
      salesAtrCodes,
    );
    if (query && !matchesSalesListSearch(query, source, status)) continue;
    totalLines += 1;
    resolvedLines.push(status);
  }

  return {
    totalLines,
    statuses: assembleSalesKpiStatuses(inventoryCodes, resolvedLines),
  };
}

export const salesKpiService = {
  async getKpis(tenantId: string, q?: string): Promise<SalesKpis> {
    const sources = await salesRepository.listDetailStatusSources(tenantId);
    return computeSalesKpis(tenantId, sources, q);
  },
};
