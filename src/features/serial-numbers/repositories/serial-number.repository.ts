import type { LookupRecordStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import {
  describeWriteError,
  SAP_SYNC_CHUNK,
  SAP_SYNC_WRITE_CONCURRENCY,
} from "@/features/sap/services/sap-master-data";
import { mapWithConcurrency } from "@/lib/shared/concurrency";
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

  /** Every serial for the tenant, keyed for SAP matching on `serialNo`. */
  listSapSyncSnapshot(tenantId: string) {
    return prisma.serialNumber.findMany({
      where: { tenantId },
      select: { id: true, serialNo: true, modelId: true },
    });
  },

  /**
   * Apply a SAP serial sync. Chunked, with a per-row fallback so one rejected row is
   * reported by itself rather than failing the whole batch.
   *
   * Creates carry no inventory: no BranchInventory or WarehouseInventory row is made,
   * so a synced serial exists in the registry with no location until something in ISMS
   * puts it somewhere.
   */
  async applySapSync(
    tenantId: string,
    input: {
      create: { serialNo: string; modelId: string }[];
      update: { id: string; serialNo: string; modelId: string }[];
    },
  ) {
    const failures: { sapCode: string; name: string | null; reason: string }[] = [];
    let created = 0;
    let updated = 0;

    for (let i = 0; i < input.create.length; i += SAP_SYNC_CHUNK) {
      const chunk = input.create.slice(i, i + SAP_SYNC_CHUNK);
      try {
        const result = await prisma.serialNumber.createMany({
          data: chunk.map((row) => ({ tenantId, ...row, recordStatus: "active" as const })),
        });
        created += result.count;
      } catch {
        for (const row of chunk) {
          try {
            await prisma.serialNumber.create({
              data: { tenantId, ...row, recordStatus: "active" },
            });
            created += 1;
          } catch (e) {
            failures.push({ sapCode: row.serialNo, name: null, reason: describeWriteError(e) });
          }
        }
      }
    }

    // See dealer.repository.ts — independent per-row updates, run concurrently.
    // This is the highest-volume sync, so it benefits most.
    const outcomes = await mapWithConcurrency(
      input.update,
      SAP_SYNC_WRITE_CONCURRENCY,
      async (row) => {
        try {
          await prisma.serialNumber.update({
            where: { id: row.id, tenantId },
            data: { modelId: row.modelId },
          });
          return null;
        } catch (e) {
          return {
            sapCode: row.serialNo,
            name: null as string | null,
            reason: describeWriteError(e),
          };
        }
      },
    );
    for (const outcome of outcomes) {
      if (outcome) failures.push(outcome);
      else updated += 1;
    }

    return { created, updated, failures };
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
