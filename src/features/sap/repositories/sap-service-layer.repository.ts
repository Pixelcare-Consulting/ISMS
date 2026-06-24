import { prisma } from "@/lib/database/client";

export const sapServiceLayerRepository = {
  listByTenant(tenantId: string) {
    return prisma.sapServiceLayerConfig.findMany({
      where: { tenantId },
      orderBy: [{ isEnabled: "desc" }, { updatedAt: "desc" }],
    });
  },

  findEnabledByTenant(tenantId: string) {
    return prisma.sapServiceLayerConfig.findFirst({
      where: { tenantId, isEnabled: true },
      orderBy: { updatedAt: "desc" },
    });
  },

  findByIdForTenant(id: string, tenantId: string) {
    return prisma.sapServiceLayerConfig.findFirst({
      where: { id, tenantId },
    });
  },

  create(
    tenantId: string,
    data: {
      baseUrlEncrypted: string;
      companyDbEncrypted: string;
      usernameEncrypted: string;
      passwordEncrypted: string;
      isEnabled: boolean;
      verifySsl: boolean;
      languageCode: string;
    },
  ) {
    return prisma.sapServiceLayerConfig.create({
      data: { tenantId, ...data },
    });
  },

  update(
    id: string,
    tenantId: string,
    data: {
      baseUrlEncrypted: string;
      companyDbEncrypted: string;
      usernameEncrypted: string;
      passwordEncrypted?: string;
      isEnabled: boolean;
      verifySsl: boolean;
      languageCode: string;
    },
  ) {
    return prisma.sapServiceLayerConfig.updateMany({
      where: { id, tenantId },
      data,
    });
  },

  delete(id: string, tenantId: string) {
    return prisma.sapServiceLayerConfig.deleteMany({
      where: { id, tenantId },
    });
  },

  async setActiveStatus(id: string, tenantId: string, isEnabled: boolean) {
    return prisma.$transaction(async (tx) => {
      if (isEnabled) {
        await tx.sapServiceLayerConfig.updateMany({
          where: { tenantId, isEnabled: true },
          data: { isEnabled: false },
        });
      }

      return tx.sapServiceLayerConfig.updateMany({
        where: { id, tenantId },
        data: { isEnabled },
      });
    });
  },
};
