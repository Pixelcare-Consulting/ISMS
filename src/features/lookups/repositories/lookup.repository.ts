import type { LookupRecordStatus } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import {
  LOOKUP_ENTITIES,
  type LookupEntityKey,
  type LookupParentKey,
} from "@/features/lookups/constants/lookup-registry";

export interface LookupRecord {
  id: string;
  tenantId: string;
  name: string;
  recordStatus: LookupRecordStatus;
  code?: string | null;
  class?: string | null;
  brandId?: string | null;
  regionId?: string | null;
  sizeId?: string | null;
  documentTypeId?: string | null;
  competitorBrandId?: string | null;
  brand?: { name: string } | null;
  region?: { name: string } | null;
  size?: { name: string } | null;
  documentType?: { name: string } | null;
  competitorBrand?: { name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

interface LookupDelegate {
  findMany(args: {
    where: Record<string, unknown>;
    orderBy: Record<string, "asc" | "desc">;
    include?: Record<string, unknown>;
  }): Promise<LookupRecord[]>;
  findFirst(args: { where: Record<string, unknown> }): Promise<LookupRecord | null>;
  create(args: { data: Record<string, unknown> }): Promise<LookupRecord>;
  update(args: {
    where: { id: string; tenantId: string };
    data: Record<string, unknown>;
  }): Promise<LookupRecord>;
}

const delegates: Record<LookupEntityKey | "brand", LookupDelegate> = {
  brand: prisma.brand as unknown as LookupDelegate,
  category: prisma.category as unknown as LookupDelegate,
  feature: prisma.feature as unknown as LookupDelegate,
  size: prisma.size as unknown as LookupDelegate,
  actualSize: prisma.actualSize as unknown as LookupDelegate,
  resolution: prisma.resolution as unknown as LookupDelegate,
  packageType: prisma.packageType as unknown as LookupDelegate,
  area: prisma.area as unknown as LookupDelegate,
  region: prisma.region as unknown as LookupDelegate,
  province: prisma.province as unknown as LookupDelegate,
  dealerArea: prisma.dealerArea as unknown as LookupDelegate,
  branchArea: prisma.branchArea as unknown as LookupDelegate,
  saleType: prisma.saleType as unknown as LookupDelegate,
  paymentType: prisma.paymentType as unknown as LookupDelegate,
  modeOfPayment: prisma.modeOfPayment as unknown as LookupDelegate,
  promoType: prisma.promoType as unknown as LookupDelegate,
  competitor: prisma.competitor as unknown as LookupDelegate,
  competitorBrand: prisma.competitorBrand as unknown as LookupDelegate,
  competitorModel: prisma.competitorModel as unknown as LookupDelegate,
  dealerType: prisma.dealerType as unknown as LookupDelegate,
  customerDeliveryMethod: prisma.customerDeliveryMethod as unknown as LookupDelegate,
  problemDescription: prisma.problemDescription as unknown as LookupDelegate,
  documentType: prisma.documentType as unknown as LookupDelegate,
  returnType: prisma.returnType as unknown as LookupDelegate,
  branchStatusType: prisma.branchStatusType as unknown as LookupDelegate,
};

export const lookupRepository = {
  list(entity: LookupEntityKey, tenantId: string) {
    const parent = LOOKUP_ENTITIES[entity].parent;
    return delegates[entity].findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      ...(parent
        ? { include: { [parent.relation]: { select: { name: true } } } }
        : {}),
    });
  },

  listParentOptions(parent: LookupParentKey, tenantId: string) {
    return delegates[parent].findMany({
      where: {
        tenantId,
        recordStatus: "active",
      },
      orderBy: { name: "asc" },
    });
  },

  findById(entity: LookupEntityKey, tenantId: string, id: string) {
    return delegates[entity].findFirst({ where: { id, tenantId } });
  },

  findParent(parent: LookupParentKey, tenantId: string, id: string) {
    return delegates[parent].findFirst({ where: { id, tenantId } });
  },

  create(entity: LookupEntityKey, tenantId: string, data: Record<string, unknown>) {
    return delegates[entity].create({ data: { tenantId, ...data } });
  },

  update(
    entity: LookupEntityKey,
    tenantId: string,
    id: string,
    data: Record<string, unknown>,
  ) {
    return delegates[entity].update({ where: { id, tenantId }, data });
  },
};
