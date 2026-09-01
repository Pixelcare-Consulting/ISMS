import type { LookupRecordStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import { createInChunks, updateEach } from "@/features/sap/services/sap-sync-writer";
import type { SapSyncApplyResult } from "@/features/sap/types/sap-sync-entity";
import {
  resolvePagination,
  toPaginatedResult,
} from "@/lib/shared/pagination";

const serialListInclude = {
  model: {
    select: {
      id: true,
      skuCode: true,
      name: true,
      brand: { select: { name: true } },
    },
  },
  branchInventories: {
    orderBy: { updatedAt: "desc" },
    take: 1,
    select: {
      updatedAt: true,
      branch: { select: { id: true, name: true } },
      statusCode: { select: { id: true, code: true, name: true, color: true } },
    },
  },
} satisfies Prisma.SerialNumberInclude;

const serialTraceabilityInclude = {
  model: {
    select: {
      id: true,
      skuCode: true,
      name: true,
      brand: { select: { name: true } },
    },
  },
  branchInventories: {
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      updatedAt: true,
      branch: { select: { name: true } },
      statusCode: { select: { code: true, name: true, color: true } },
    },
  },
  salesDetails: {
    select: {
      id: true,
      saleAmount: true,
      sale: {
        select: {
          id: true,
          transactionNo: true,
          amount: true,
          atrStatus: true,
          createdAt: true,
          branch: { select: { name: true } },
          returnRequest: { select: { id: true, status: true, createdAt: true } },
        },
      },
    },
  },
  transferLines: {
    select: {
      id: true,
      transfer: {
        select: {
          id: true,
          transferNo: true,
          createdAt: true,
          fromBranch: { select: { name: true } },
          toBranch: { select: { name: true } },
          statusCode: { select: { code: true, name: true, color: true } },
        },
      },
    },
  },
  pulloutLines: {
    select: {
      id: true,
      pullout: {
        select: {
          id: true,
          pulloutNo: true,
          createdAt: true,
          branch: { select: { name: true } },
          warehouse: { select: { name: true } },
          statusCode: { select: { code: true, name: true, color: true } },
        },
      },
    },
  },
  stockCountLines: {
    select: {
      id: true,
      status: true,
      countedAt: true,
      session: {
        select: {
          id: true,
          sessionNo: true,
          createdAt: true,
          branch: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.SerialNumberInclude;

export type SerialTraceabilityRow = Prisma.SerialNumberGetPayload<{
  include: typeof serialTraceabilityInclude;
}>;

export type SerialNumberListSort = "serialNo" | "model" | "recordStatus";
export type SerialNumberListSortDir = "asc" | "desc";

function serialNumberPrismaOrderBy(
  field: SerialNumberListSort,
  dir: SerialNumberListSortDir,
): Prisma.SerialNumberOrderByWithRelationInput {
  switch (field) {
    case "serialNo":
      return { serialNo: dir };
    case "model":
      return { model: { skuCode: dir } };
    case "recordStatus":
      return { recordStatus: dir };
    default:
      return { createdAt: dir };
  }
}

export const serialNumberRepository = {
  async list(
    tenantId: string,
    pagination?: { page?: number; limit?: number },
    filters?: { q?: string; status?: LookupRecordStatus },
    sort?: { field?: SerialNumberListSort; dir?: SerialNumberListSortDir },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const q = filters?.q?.trim();

    const where: Prisma.SerialNumberWhereInput = {
      tenantId,
      ...(filters?.status ? { recordStatus: filters.status } : {}),
      ...(q
        ? {
            OR: [
              { serialNo: { contains: q, mode: "insensitive" } },
              { model: { skuCode: { contains: q, mode: "insensitive" } } },
              { model: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const orderBy = sort?.field
      ? serialNumberPrismaOrderBy(sort.field, sort.dir ?? "desc")
      : { createdAt: "desc" as const };

    const [items, total] = await Promise.all([
      prisma.serialNumber.findMany({
        where,
        include: serialListInclude,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.serialNumber.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },

  findById(tenantId: string, id: string) {
    return prisma.serialNumber.findFirst({ where: { id, tenantId } });
  },

  getTraceability(tenantId: string, id: string) {
    return prisma.serialNumber.findFirst({
      where: { id, tenantId },
      include: serialTraceabilityInclude,
    });
  },

  findModelInTenant(tenantId: string, modelId: string) {
    return prisma.productModel.findFirst({
      where: { id: modelId, tenantId },
      select: { id: true },
    });
  },

  listModelOptions(tenantId: string) {
    return prisma.productModel.findMany({
      where: { tenantId },
      orderBy: { skuCode: "asc" },
      select: { id: true, skuCode: true, name: true },
    });
  },

  create(
    tenantId: string,
    data: { serialNo: string; modelId: string; createdById?: string },
  ) {
    return prisma.serialNumber.create({ data: { tenantId, ...data } });
  },

  update(
    tenantId: string,
    id: string,
    data: { serialNo: string; modelId: string },
  ) {
    return prisma.serialNumber.update({ where: { id, tenantId }, data });
  },

  setStatus(tenantId: string, id: string, recordStatus: LookupRecordStatus) {
    return prisma.serialNumber.update({
      where: { id, tenantId },
      data: { recordStatus },
    });
  },

  /**
   * Apply one page of a SAP serial sync.
   *
   * The existence check is an indexed lookup over just this page's serial numbers, so
   * memory stays flat however large the entity is — the reason nothing here ever loads a
   * snapshot of the table.
   *
   * Creates carry no inventory: no BranchInventory or WarehouseInventory row is made, so
   * a synced serial exists in the registry with no location until something in ISMS puts
   * it somewhere.
   */
  async applySapSyncPage(
    tenantId: string,
    records: { serialNo: string; modelId: string }[],
  ): Promise<SapSyncApplyResult> {
    // SAP keys serials per item, so one serial number can arrive under two items within a
    // page. ISMS is unique on serialNo alone, so the first occurrence wins.
    const rows = [...new Map(records.map((row) => [row.serialNo, row])).values()];

    const existing = await prisma.serialNumber.findMany({
      where: { tenantId, serialNo: { in: rows.map((row) => row.serialNo) } },
      select: { id: true, serialNo: true, modelId: true },
    });
    const bySerialNo = new Map(existing.map((serial) => [serial.serialNo, serial]));

    const toCreate: { serialNo: string; modelId: string }[] = [];
    const toUpdate: { id: string; serialNo: string; modelId: string }[] = [];
    let unchanged = 0;

    for (const row of rows) {
      const match = bySerialNo.get(row.serialNo);
      if (!match) {
        toCreate.push(row);
        continue;
      }
      // A serial already here from the PSG import gets its model linked (or corrected)
      // rather than being ignored — that link is the point of the sync.
      if (match.modelId === row.modelId) unchanged += 1;
      else toUpdate.push({ id: match.id, serialNo: row.serialNo, modelId: row.modelId });
    }

    const inserted = await createInChunks(toCreate, {
      createMany: async (chunk) => {
        const result = await prisma.serialNumber.createMany({
          data: chunk.map((row) => ({ tenantId, ...row, recordStatus: "active" as const })),
          // A concurrent writer (PSG import, an overlapping slice) may have inserted the
          // same serial between the lookup above and this write.
          skipDuplicates: true,
        });
        return result.count;
      },
      createOne: async (row) => {
        await prisma.serialNumber.create({
          data: { tenantId, ...row, recordStatus: "active" },
        });
      },
      describe: (row) => row.serialNo,
    });

    const changed = await updateEach(toUpdate, {
      updateOne: async (row) => {
        await prisma.serialNumber.update({
          where: { id: row.id, tenantId },
          data: { modelId: row.modelId },
        });
      },
      describe: (row) => row.serialNo,
    });

    return {
      created: inserted.created,
      updated: changed.updated,
      unchanged,
      failures: [...inserted.failures, ...changed.failures],
    };
  },

  countAll(tenantId: string) {
    return prisma.serialNumber.count({ where: { tenantId } });
  },

  countByRecordStatus(tenantId: string) {
    return prisma.serialNumber.groupBy({
      by: ["recordStatus"],
      where: { tenantId },
      _count: { id: true },
    });
  },
};
