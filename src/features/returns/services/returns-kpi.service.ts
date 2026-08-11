import type { ReturnRequestStatus } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import type { KpiStatusCount } from "@/lib/kpi-cards";

const RETURN_STATUS_ORDER: ReturnRequestStatus[] = [
  "pending_cs",
  "pending_tl",
  "approved",
  "rejected",
  "completed",
];

const APPROVAL_STATUS_ORDER: ReturnRequestStatus[] = [
  "pending_cs",
  "pending_tl",
  "approved",
];

const RETURN_STATUS_LABELS: Record<ReturnRequestStatus, string> = {
  pending_cs: "Pending CS",
  pending_tl: "Pending TL",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
};

export interface ReturnsKpis {
  totalReturns: number;
  statuses: KpiStatusCount[];
}

export interface ReturnsKpisByTab {
  branch: ReturnsKpis;
  service: ReturnsKpis;
  approvals: ReturnsKpis;
}

function buildKpisFromGroups(
  groups: Array<{ status: ReturnRequestStatus; _count: { id: number } }>,
  totalReturns: number,
  order: ReturnRequestStatus[],
): ReturnsKpis {
  const countByStatus = new Map(
    groups.map((g) => [g.status, g._count.id] as const),
  );

  return {
    totalReturns,
    statuses: order.map((status) => ({
      code: status,
      name: RETURN_STATUS_LABELS[status],
      count: countByStatus.get(status) ?? 0,
    })),
  };
}

export const returnsKpiService = {
  async getBranchKpis(tenantId: string): Promise<ReturnsKpis> {
    const [groups, totalReturns] = await Promise.all([
      prisma.branchReturnRequest.groupBy({
        by: ["status"],
        where: { tenantId },
        _count: { id: true },
      }),
      prisma.branchReturnRequest.count({ where: { tenantId } }),
    ]);

    return buildKpisFromGroups(groups, totalReturns, RETURN_STATUS_ORDER);
  },

  async getServiceKpis(
    tenantId: string,
    serviceCenterIds: string[] | null,
  ): Promise<ReturnsKpis> {
    const where = {
      tenantId,
      sale: {
        ...(serviceCenterIds ? { serviceCenterId: { in: serviceCenterIds } } : {}),
      },
    };

    const [groups, totalReturns] = await Promise.all([
      prisma.serviceCenterReturnRequest.groupBy({
        by: ["status"],
        where,
        _count: { id: true },
      }),
      prisma.serviceCenterReturnRequest.count({ where }),
    ]);

    return buildKpisFromGroups(groups, totalReturns, RETURN_STATUS_ORDER);
  },

  async getApprovalsKpis(
    tenantId: string,
    serviceCenterIds: string[] | null,
  ): Promise<ReturnsKpis> {
    const approvalStatuses = [...APPROVAL_STATUS_ORDER];

    const branchWhere = {
      tenantId,
      status: { in: approvalStatuses },
    };
    const serviceWhere = {
      tenantId,
      status: { in: approvalStatuses },
      sale: {
        ...(serviceCenterIds ? { serviceCenterId: { in: serviceCenterIds } } : {}),
      },
    };

    const [branchGroups, scGroups, branchTotal, scTotal] = await Promise.all([
      prisma.branchReturnRequest.groupBy({
        by: ["status"],
        where: branchWhere,
        _count: { id: true },
      }),
      prisma.serviceCenterReturnRequest.groupBy({
        by: ["status"],
        where: serviceWhere,
        _count: { id: true },
      }),
      prisma.branchReturnRequest.count({ where: branchWhere }),
      prisma.serviceCenterReturnRequest.count({ where: serviceWhere }),
    ]);

    const merged = new Map<ReturnRequestStatus, number>();
    for (const group of [...branchGroups, ...scGroups]) {
      merged.set(
        group.status,
        (merged.get(group.status) ?? 0) + group._count.id,
      );
    }

    const totalReturns = branchTotal + scTotal;

    return {
      totalReturns,
      statuses: APPROVAL_STATUS_ORDER.map((status) => ({
        code: status,
        name: RETURN_STATUS_LABELS[status],
        count: merged.get(status) ?? 0,
      })),
    };
  },

  async getAllTabsKpis(
    tenantId: string,
    serviceCenterIds: string[] | null,
  ): Promise<ReturnsKpisByTab> {
    const [branch, service, approvals] = await Promise.all([
      this.getBranchKpis(tenantId),
      this.getServiceKpis(tenantId, serviceCenterIds),
      this.getApprovalsKpis(tenantId, serviceCenterIds),
    ]);

    return { branch, service, approvals };
  },
};
