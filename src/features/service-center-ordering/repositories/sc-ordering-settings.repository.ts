import type { ScOrderingDefaultKey } from "@/features/service-center-ordering/constants";
import { prisma } from "@/lib/database/client";

export type ScOrderingDefaults = Record<ScOrderingDefaultKey, string | null>;

const DEFAULTS_SELECT = {
  warehouseCode: true,
  branchCode: true,
  departmentCode: true,
  cogsBranchCode: true,
} as const;

export const scOrderingSettingsRepository = {
  findDefaults(tenantId: string): Promise<ScOrderingDefaults | null> {
    return prisma.serviceCenterOrderingSettings.findUnique({
      where: { tenantId },
      select: DEFAULTS_SELECT,
    });
  },

  upsertDefaults(tenantId: string, defaults: ScOrderingDefaults) {
    return prisma.serviceCenterOrderingSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...defaults },
      update: defaults,
      select: DEFAULTS_SELECT,
    });
  },

  /** Primary first, then by code. */
  listCustomers(tenantId: string) {
    return prisma.serviceCenterOrderCustomer.findMany({
      where: { tenantId },
      select: { id: true, cardCode: true, cardName: true, isPrimary: true },
      orderBy: [{ isPrimary: "desc" }, { cardCode: "asc" }],
    });
  },

  findCustomer(tenantId: string, cardCode: string) {
    return prisma.serviceCenterOrderCustomer.findUnique({
      where: { tenantId_cardCode: { tenantId, cardCode } },
      select: { id: true, cardCode: true, cardName: true, isPrimary: true },
    });
  },

  /** The first customer added becomes primary, so the form always has a default. */
  async addCustomer(tenantId: string, input: { cardCode: string; cardName: string | null }) {
    return prisma.$transaction(async (tx) => {
      const hasPrimary = await tx.serviceCenterOrderCustomer.count({
        where: { tenantId, isPrimary: true },
      });
      return tx.serviceCenterOrderCustomer.create({
        data: { tenantId, ...input, isPrimary: hasPrimary === 0 },
        select: { id: true, cardCode: true },
      });
    });
  },

  /** Clear first: the partial unique index allows one primary per tenant at any moment. */
  setPrimary(tenantId: string, id: string) {
    return prisma.$transaction(async (tx) => {
      const target = await tx.serviceCenterOrderCustomer.findFirst({
        where: { id, tenantId },
        select: { id: true, cardCode: true },
      });
      if (!target) return null;
      await tx.serviceCenterOrderCustomer.updateMany({
        where: { tenantId, isPrimary: true },
        data: { isPrimary: false },
      });
      await tx.serviceCenterOrderCustomer.update({ where: { id }, data: { isPrimary: true } });
      return target;
    });
  },

  /** Removing the primary promotes the next customer by code. */
  removeCustomer(tenantId: string, id: string) {
    return prisma.$transaction(async (tx) => {
      const target = await tx.serviceCenterOrderCustomer.findFirst({
        where: { id, tenantId },
        select: { id: true, cardCode: true, isPrimary: true },
      });
      if (!target) return null;
      await tx.serviceCenterOrderCustomer.delete({ where: { id } });
      if (target.isPrimary) {
        const next = await tx.serviceCenterOrderCustomer.findFirst({
          where: { tenantId },
          orderBy: { cardCode: "asc" },
          select: { id: true },
        });
        if (next) {
          await tx.serviceCenterOrderCustomer.update({
            where: { id: next.id },
            data: { isPrimary: true },
          });
        }
      }
      return target;
    });
  },
};
