import { prisma } from "@/lib/database/client";

export const sapServiceLayerRepository = {
  findByTenant(tenantId: string) {
    return prisma.sapServiceLayerConfig.findUnique({
      where: { tenantId },
    });
  },

  upsert(
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
    return prisma.sapServiceLayerConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  },
};
