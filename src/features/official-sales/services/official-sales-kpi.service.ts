import type { OfficialSalesImportRowStatus } from "@prisma/client";

import { officialSalesRepository } from "@/features/official-sales/repositories/official-sales.repository";
import type { KpiStatusCount } from "@/lib/kpi-cards";

const STATUS_ORDER: OfficialSalesImportRowStatus[] = [
  "pending",
  "success",
  "error",
];

const STATUS_LABELS: Record<OfficialSalesImportRowStatus, string> = {
  pending: "Pending",
  success: "Success",
  error: "Error",
};

export interface OfficialSalesKpis {
  totalRows: number;
  statuses: KpiStatusCount[];
}

export const officialSalesKpiService = {
  async getKpis(tenantId: string): Promise<OfficialSalesKpis> {
    const [groups, totalRows] = await Promise.all([
      officialSalesRepository.countByStatus(tenantId),
      officialSalesRepository.countAll(tenantId),
    ]);

    const countByStatus = new Map(
      groups.map((g) => [g.status, g._count.id] as const),
    );

    return {
      totalRows,
      statuses: STATUS_ORDER.map((status) => ({
        code: status,
        name: STATUS_LABELS[status],
        count: countByStatus.get(status) ?? 0,
      })),
    };
  },
};
