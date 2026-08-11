import { prisma } from "@/lib/database/client";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import type { KpiStatusCount } from "@/lib/kpi-cards";
import {
  SALES_LIST_STATUS_CODES,
  salesListDetailWhere,
} from "@/features/sales/constants/sales-list-status";

const SALE_STATUS_FALLBACK: Record<string, string> = {
  SLD: "Sold",
  OFS: "Official Sold",
  FW: "TO FOLLOW",
};

export interface SalesKpis {
  totalLines: number;
  statuses: KpiStatusCount[];
}

export const salesKpiService = {
  async getKpis(tenantId: string): Promise<SalesKpis> {
    const inventoryCodes =
      await reasonStatusRepository.listActiveCodesByCategory(
        tenantId,
        "inventory_system",
      );

    const saleStatusCodeIds = inventoryCodes
      .filter((row) =>
        SALES_LIST_STATUS_CODES.some(
          (code) => row.code.toUpperCase() === code.toUpperCase(),
        ),
      )
      .map((row) => row.id);

    const codeById = new Map(
      inventoryCodes.map((row) => [row.id, row] as const),
    );

    const listWhere = salesListDetailWhere(tenantId);

    const [statusGroups, totalLines] = await Promise.all([
      saleStatusCodeIds.length > 0
        ? prisma.branchSalesTransactionDetail.groupBy({
            by: ["statusCodeId"],
            where: {
              ...listWhere,
              statusCodeId: { in: saleStatusCodeIds },
            },
            _count: { id: true },
          })
        : Promise.resolve([]),
      prisma.branchSalesTransactionDetail.count({
        where: listWhere,
      }),
    ]);

    const statusCountByCode = new Map<string, number>();
    for (const group of statusGroups) {
      if (!group.statusCodeId) continue;
      const code = codeById.get(group.statusCodeId)?.code?.toUpperCase();
      if (!code) continue;
      statusCountByCode.set(
        code,
        (statusCountByCode.get(code) ?? 0) + group._count.id,
      );
    }

    return {
      totalLines,
      statuses: SALES_LIST_STATUS_CODES.map((code) => {
        const meta = inventoryCodes.find(
          (row) => row.code.toUpperCase() === code,
        );
        return {
          code,
          name: meta?.name ?? SALE_STATUS_FALLBACK[code] ?? code,
          count: statusCountByCode.get(code) ?? 0,
        };
      }),
    };
  },
};
