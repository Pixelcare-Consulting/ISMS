import type { Prisma } from "@prisma/client";

import type {
  CustomDashboardPeriod,
  CustomDashboardVisibility,
} from "@/features/custom-dashboards/schemas/custom-dashboard.schema";
import { prisma } from "@/lib/database/client";

export interface CustomDashboardSummary {
  id: string;
  name: string;
  description: string | null;
  visibility: CustomDashboardVisibility;
  ownerName: string;
  isOwner: boolean;
  updatedAt: string;
}

export interface CustomDashboardDetail extends CustomDashboardSummary {
  template: Record<string, unknown>;
  defaultPeriod: CustomDashboardPeriod;
}

interface DetailsInput {
  name: string;
  description?: string;
  visibility: CustomDashboardVisibility;
}

const SUMMARY_SELECT = {
  id: true,
  name: true,
  description: true,
  visibility: true,
  ownerUserId: true,
  updatedAt: true,
  owner: { select: { name: true, email: true } },
} as const;

/** Own dashboards plus ones shared with the tenant. */
function readableWhere(tenantId: string, userId: string) {
  return {
    tenantId,
    OR: [{ ownerUserId: userId }, { visibility: "TENANT" as const }],
  };
}

function toSummary(
  row: {
    id: string;
    name: string;
    description: string | null;
    visibility: CustomDashboardVisibility;
    ownerUserId: string;
    updatedAt: Date;
    owner: { name: string | null; email: string };
  },
  userId: string,
): CustomDashboardSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    ownerName: row.owner.name ?? row.owner.email,
    isOwner: row.ownerUserId === userId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const customDashboardService = {
  async list(tenantId: string, userId: string): Promise<CustomDashboardSummary[]> {
    const rows = await prisma.customDashboard.findMany({
      where: readableWhere(tenantId, userId),
      select: SUMMARY_SELECT,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((row) => toSummary(row, userId));
  },

  async findReadable(tenantId: string, userId: string, id: string): Promise<CustomDashboardDetail | null> {
    const row = await prisma.customDashboard.findFirst({
      where: { id, ...readableWhere(tenantId, userId) },
      select: { ...SUMMARY_SELECT, template: true, defaultPeriod: true },
    });
    if (!row) return null;
    return {
      ...toSummary(row, userId),
      template: row.template as Record<string, unknown>,
      defaultPeriod: row.defaultPeriod,
    };
  },

  async create(
    tenantId: string,
    userId: string,
    details: DetailsInput,
    template: Record<string, unknown>,
  ): Promise<{ id: string }> {
    return prisma.customDashboard.create({
      data: {
        tenantId,
        ownerUserId: userId,
        name: details.name,
        description: details.description || null,
        visibility: details.visibility,
        template: template as Prisma.InputJsonObject,
      },
      select: { id: true },
    });
  },

  /** Owner-only writes; returns false when the dashboard isn't the caller's. */
  async updateDetails(tenantId: string, userId: string, id: string, details: DetailsInput): Promise<boolean> {
    const { count } = await prisma.customDashboard.updateMany({
      where: { id, tenantId, ownerUserId: userId },
      data: {
        name: details.name,
        description: details.description || null,
        visibility: details.visibility,
      },
    });
    return count > 0;
  },

  async saveTemplate(
    tenantId: string,
    userId: string,
    id: string,
    template: Record<string, unknown>,
  ): Promise<boolean> {
    const { count } = await prisma.customDashboard.updateMany({
      where: { id, tenantId, ownerUserId: userId },
      data: { template: template as Prisma.InputJsonObject },
    });
    return count > 0;
  },

  async savePeriod(tenantId: string, userId: string, id: string, period: CustomDashboardPeriod): Promise<boolean> {
    const { count } = await prisma.customDashboard.updateMany({
      where: { id, tenantId, ownerUserId: userId },
      data: { defaultPeriod: period },
    });
    return count > 0;
  },

  async remove(tenantId: string, userId: string, id: string): Promise<boolean> {
    const { count } = await prisma.customDashboard.deleteMany({
      where: { id, tenantId, ownerUserId: userId },
    });
    return count > 0;
  },
};
