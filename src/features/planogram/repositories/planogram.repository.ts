import { prisma } from "@/lib/database/client";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";

export const planogramRepository = {
  listByBranch(tenantId: string, branchId: string) {
    return prisma.branchPlanogram.findMany({
      where: { tenantId, branchId },
      include: {
        model: {
          select: {
            id: true,
            skuCode: true,
            name: true,
            status: true,
            brand: { select: { name: true } },
          },
        },
      },
      orderBy: { model: { skuCode: "asc" } },
    });
  },

  findMilSetting(tenantId: string, branchId: string, modelId: string) {
    return prisma.branchMilSetting.findFirst({
      where: { tenantId, branchId, modelId },
    });
  },

  listMilByBranch(tenantId: string, branchId: string) {
    return prisma.branchMilSetting.findMany({
      where: { tenantId, branchId },
    });
  },

  async countStockForModel(tenantId: string, branchId: string, modelId: string) {
    const stk = await reasonStatusRepository.findCodeId(
      tenantId,
      "inventory_system",
      "STK",
    );
    if (!stk) return 0;
    return prisma.branchInventory.count({
      where: {
        tenantId,
        branchId,
        statusCodeId: stk.id,
        serialNumber: { modelId },
      },
    });
  },

  findOldestStockForModel(
    tenantId: string,
    branchId: string,
    modelId: string,
    statusCodeId: string,
  ) {
    return prisma.branchInventory.findFirst({
      where: {
        tenantId,
        branchId,
        statusCodeId,
        serialNumber: { modelId },
      },
      orderBy: { updatedAt: "asc" },
      select: { updatedAt: true },
    });
  },

  findPlanogramEntryById(tenantId: string, planogramId: string) {
    return prisma.branchPlanogram.findFirst({
      where: { id: planogramId, tenantId },
    });
  },

  findPlanogramEntry(tenantId: string, branchId: string, modelId: string) {
    return prisma.branchPlanogram.findFirst({
      where: { tenantId, branchId, modelId },
    });
  },

  createEntry(
    tenantId: string,
    data: { branchId: string; modelId: string; maxQty: number },
  ) {
    return prisma.branchPlanogram.create({
      data: {
        tenantId,
        branchId: data.branchId,
        modelId: data.modelId,
        maxQty: data.maxQty,
      },
      include: {
        model: { select: { id: true, skuCode: true, name: true, status: true } },
      },
    });
  },

  updateMaxQty(tenantId: string, id: string, maxQty: number) {
    return prisma.branchPlanogram.update({
      where: { id, tenantId },
      data: { maxQty },
    });
  },

  deleteEntry(tenantId: string, id: string) {
    return prisma.branchPlanogram.delete({ where: { id, tenantId } });
  },

  upsertMil(
    tenantId: string,
    data: { branchId: string; modelId: string; daysThreshold: number },
  ) {
    return prisma.branchMilSetting.upsert({
      where: {
        branchId_modelId: { branchId: data.branchId, modelId: data.modelId },
      },
      create: {
        tenantId,
        branchId: data.branchId,
        modelId: data.modelId,
        daysThreshold: data.daysThreshold,
      },
      update: { daysThreshold: data.daysThreshold },
    });
  },

  deleteMil(tenantId: string, branchId: string, modelId: string) {
    return prisma.branchMilSetting.deleteMany({
      where: { tenantId, branchId, modelId },
    });
  },

  hasOpenOrdersForModel(tenantId: string, branchId: string, modelId: string) {
    return prisma.branchOrderDetail.findFirst({
      where: {
        modelId,
        order: {
          tenantId,
          branchId,
          status: {
            in: ["pending_tl", "pending_sp", "pending_logistics"],
          },
        },
      },
      select: { id: true },
    });
  },

  listPlanogramModelsForOrder(tenantId: string, branchId: string) {
    return prisma.branchPlanogram.findMany({
      where: {
        tenantId,
        branchId,
        model: { status: "active" },
      },
      include: {
        model: { select: { id: true, skuCode: true, name: true, status: true } },
      },
      orderBy: { model: { skuCode: "asc" } },
    });
  },

  listBelowCapacityAndMilBreaches(
    tenantId: string,
    branchIds: string[] | null,
  ) {
    const branchFilter =
      branchIds && branchIds.length > 0 ? { branchId: { in: branchIds } } : {};

    return prisma.branchPlanogram.findMany({
      where: { tenantId, ...branchFilter },
      include: {
        model: { select: { id: true, skuCode: true } },
        branch: { select: { id: true, name: true } },
      },
    });
  },
};
