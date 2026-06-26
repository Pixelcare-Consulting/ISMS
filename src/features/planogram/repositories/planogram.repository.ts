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
            srp: true,
            brand: { select: { name: true } },
            category: { select: { name: true } },
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
    const counts = await planogramRepository.countStockByBranchModels(
      tenantId,
      branchId,
      [modelId],
    );
    return counts.get(modelId) ?? 0;
  },

  async countStockByBranchModels(
    tenantId: string,
    branchId: string,
    modelIds: string[],
  ): Promise<Map<string, number>> {
    if (modelIds.length === 0) return new Map();

    const stk = await reasonStatusRepository.findCodeId(
      tenantId,
      "inventory_system",
      "STK",
    );
    const counts = new Map<string, number>();
    for (const modelId of modelIds) {
      counts.set(modelId, 0);
    }
    if (!stk) return counts;

    const rows = await prisma.branchInventory.findMany({
      where: {
        tenantId,
        branchId,
        statusCodeId: stk.id,
        serialNumber: { modelId: { in: modelIds } },
      },
      select: { serialNumber: { select: { modelId: true } } },
    });

    for (const row of rows) {
      const modelId = row.serialNumber.modelId;
      counts.set(modelId, (counts.get(modelId) ?? 0) + 1);
    }
    return counts;
  },

  async countInventoryByStatusForModels(
    tenantId: string,
    branchId: string,
    modelIds: string[],
    statusCodeId: string,
  ): Promise<Map<string, number>> {
    if (modelIds.length === 0) return new Map();

    const counts = new Map<string, number>();
    for (const modelId of modelIds) {
      counts.set(modelId, 0);
    }

    const rows = await prisma.branchInventory.findMany({
      where: {
        tenantId,
        branchId,
        statusCodeId,
        serialNumber: { modelId: { in: modelIds } },
      },
      select: { serialNumber: { select: { modelId: true } } },
    });

    for (const row of rows) {
      const modelId = row.serialNumber.modelId;
      counts.set(modelId, (counts.get(modelId) ?? 0) + 1);
    }
    return counts;
  },

  findPlanogramModelIds(tenantId: string, branchId: string) {
    return prisma.branchPlanogram.findMany({
      where: { tenantId, branchId },
      select: { modelId: true },
    });
  },

  countOffPlanogramUnits(tenantId: string, branchId: string, planogramModelIds: string[]) {
    return prisma.branchInventory.count({
      where: {
        tenantId,
        branchId,
        serialNumber: {
          modelId: planogramModelIds.length > 0 ? { notIn: planogramModelIds } : undefined,
        },
      },
    });
  },

  async findOnPlanogramPairs(
    tenantId: string,
    pairs: { branchId: string; modelId: string }[],
  ): Promise<Set<string>> {
    if (pairs.length === 0) return new Set();

    const branchIds = [...new Set(pairs.map((p) => p.branchId))];
    const modelIds = [...new Set(pairs.map((p) => p.modelId))];

    const rows = await prisma.branchPlanogram.findMany({
      where: { tenantId, branchId: { in: branchIds }, modelId: { in: modelIds } },
      select: { branchId: true, modelId: true },
    });

    return new Set(rows.map((r) => `${r.branchId}:${r.modelId}`));
  },

  isModelOnBranchPlanogram(tenantId: string, branchId: string, modelId: string) {
    return prisma.branchPlanogram.findFirst({
      where: { tenantId, branchId, modelId },
      select: { id: true },
    });
  },

  listSerialsForPlanogramEntry(
    tenantId: string,
    branchId: string,
    modelId: string,
  ) {
    return prisma.branchInventory.findMany({
      where: {
        tenantId,
        branchId,
        serialNumber: { modelId },
      },
      include: {
        statusCode: { select: { code: true, name: true } },
        serialNumber: { select: { serialNo: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  },

  async countStockByBranchModelPairs(
    tenantId: string,
    statusCodeId: string,
    pairs: { branchId: string; modelId: string }[],
  ): Promise<Map<string, number>> {
    if (pairs.length === 0) return new Map();

    const branchIds = [...new Set(pairs.map((p) => p.branchId))];
    const modelIds = [...new Set(pairs.map((p) => p.modelId))];
    const pairKeys = new Set(pairs.map((p) => `${p.branchId}:${p.modelId}`));
    const counts = new Map<string, number>();
    for (const key of pairKeys) {
      counts.set(key, 0);
    }

    const rows = await prisma.branchInventory.findMany({
      where: {
        tenantId,
        branchId: { in: branchIds },
        statusCodeId,
        serialNumber: { modelId: { in: modelIds } },
      },
      select: {
        branchId: true,
        serialNumber: { select: { modelId: true } },
      },
    });

    for (const row of rows) {
      const key = `${row.branchId}:${row.serialNumber.modelId}`;
      if (!pairKeys.has(key)) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  },

  async findOldestStockByBranchModelPairs(
    tenantId: string,
    statusCodeId: string,
    pairs: { branchId: string; modelId: string }[],
  ): Promise<Map<string, { updatedAt: Date }>> {
    if (pairs.length === 0) return new Map();

    const branchIds = [...new Set(pairs.map((p) => p.branchId))];
    const modelIds = [...new Set(pairs.map((p) => p.modelId))];
    const pairKeys = new Set(pairs.map((p) => `${p.branchId}:${p.modelId}`));
    const oldest = new Map<string, { updatedAt: Date }>();

    const rows = await prisma.branchInventory.findMany({
      where: {
        tenantId,
        branchId: { in: branchIds },
        statusCodeId,
        serialNumber: { modelId: { in: modelIds } },
      },
      select: {
        branchId: true,
        updatedAt: true,
        serialNumber: { select: { modelId: true } },
      },
      orderBy: { updatedAt: "asc" },
    });

    for (const row of rows) {
      const key = `${row.branchId}:${row.serialNumber.modelId}`;
      if (pairKeys.has(key) && !oldest.has(key)) {
        oldest.set(key, { updatedAt: row.updatedAt });
      }
    }
    return oldest;
  },

  listMilByBranches(tenantId: string, branchIds: string[]) {
    if (branchIds.length === 0) return Promise.resolve([]);
    return prisma.branchMilSetting.findMany({
      where: { tenantId, branchId: { in: branchIds } },
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
            in: ["pending_ps", "pending_tl", "pending_sp", "pending_logistics"],
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

  async countInventoryByStatusForBranchModel(
    tenantId: string,
    branchId: string,
    modelId: string,
  ): Promise<Map<string, number>> {
    const rows = await prisma.branchInventory.groupBy({
      by: ["statusCodeId"],
      where: {
        tenantId,
        branchId,
        serialNumber: { modelId },
      },
      _count: { id: true },
    });

    const codes = await prisma.reasonStatusCode.findMany({
      where: { id: { in: rows.map((r) => r.statusCodeId) }, tenantId },
      select: { id: true, code: true },
    });
    const codeById = new Map(codes.map((c) => [c.id, c.code]));
    const counts = new Map<string, number>();
    for (const row of rows) {
      const code = codeById.get(row.statusCodeId) ?? "OTHER";
      counts.set(code, row._count.id);
    }
    return counts;
  },

  countOffPlanogramSerials(tenantId: string, branchId: string) {
    return prisma.branchInventory.count({
      where: {
        tenantId,
        branchId,
        serialNumber: {
          model: {
            branchPlanograms: { none: { branchId } },
          },
        },
      },
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
