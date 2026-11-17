import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import {
  REPLACED_STATUS,
  RETURNED_STATUS,
  SERVICE_REPLACED_STATUS,
  SERVICE_RETURNED_STATUS,
} from "@/features/sales/constants/return-history-status";
import {
  canonicalSalesListStatusCode,
  SALES_LIST_STATUS_CODES,
  SALES_RETURN_HISTORY_LIST_CODES,
} from "@/features/sales/constants/sales-list-status";
import { salesRepository } from "@/features/sales/repositories/sales.repository";
import { matchesSalesListSearch } from "@/features/sales/utils/sales-list-search";
import {
  loadSalesAtrCodesByCode,
  resolveListedLineStatus,
  resolveToFollowStatusCode,
} from "@/features/sales/utils/resolve-line-status";
import type { KpiStatusCount } from "@/lib/kpi-cards";

const SALE_STATUS_FALLBACK: Record<string, string> = {
  SLD: "Sold",
  OFS: "Official Sold",
  FW: "TO FOLLOW",
};

export interface SalesKpis {
  totalLines: number;
  statuses: KpiStatusCount[];
}

function returnHistoryCard(
  code: (typeof SALES_RETURN_HISTORY_LIST_CODES)[number],
): KpiStatusCount {
  switch (code) {
    case "returned":
      return {
        code,
        name: RETURNED_STATUS,
        count: 0,
        color: "violet",
      };
    case "replaced":
      return {
        code,
        name: REPLACED_STATUS,
        count: 0,
        color: "violet",
      };
    case "service_returned":
      return {
        code,
        name: SERVICE_RETURNED_STATUS,
        count: 0,
        color: "teal",
      };
    case "service_replaced":
      return {
        code,
        name: SERVICE_REPLACED_STATUS,
        count: 0,
        color: "teal",
      };
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}

export const salesKpiService = {
  async getKpis(tenantId: string, q?: string): Promise<SalesKpis> {
    const query = q?.trim() ?? "";
    const [inventoryCodes, sources, toFollowStatus, salesAtrCodes] =
      await Promise.all([
        reasonStatusRepository.listActiveCodesByCategory(
          tenantId,
          "inventory_system",
        ),
        salesRepository.listDetailStatusSources(tenantId),
        resolveToFollowStatusCode(tenantId),
        loadSalesAtrCodesByCode(tenantId),
      ]);

    const statusCountByCode = new Map<string, number>();
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
      if (!status) continue;
      const code = canonicalSalesListStatusCode(status.code);
      statusCountByCode.set(code, (statusCountByCode.get(code) ?? 0) + 1);
    }

    const statuses: KpiStatusCount[] = SALES_LIST_STATUS_CODES.map((code) => {
      const meta = inventoryCodes.find(
        (row) => row.code.toUpperCase() === code,
      );
      return {
        code,
        name: meta?.name ?? SALE_STATUS_FALLBACK[code] ?? code,
        count: statusCountByCode.get(code) ?? 0,
        color: meta?.color ?? null,
      };
    });

    for (const code of SALES_RETURN_HISTORY_LIST_CODES) {
      const count = statusCountByCode.get(code) ?? 0;
      if (count === 0) continue;
      statuses.push({ ...returnHistoryCard(code), count });
    }

    return {
      totalLines,
      statuses,
    };
  },
};
