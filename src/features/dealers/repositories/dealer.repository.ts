import { prisma } from "@/lib/database/client";
import { describeWriteError, SAP_SYNC_CHUNK } from "@/features/sap/services/sap-master-data";
import type { BranchStatus } from "@/lib/database/generated/prisma/client";

export const dealerRepository = {
  listByTenant(tenantId: string) {
    return prisma.dealer.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        area: { select: { id: true, name: true, code: true } },
        dealerType: { select: { id: true, name: true } },
        dealerArea: { select: { id: true, name: true } },
        modeOfPayment: { select: { id: true, name: true } },
        _count: { select: { branches: true } },
      },
      orderBy: { name: "asc" },
    });
  },

  listActiveByTenant(tenantId: string) {
    return prisma.dealer.findMany({
      where: { tenantId, deletedAt: null, status: "active" },
      include: {
        area: { select: { id: true, name: true, code: true } },
        dealerType: { select: { id: true, name: true } },
        dealerArea: { select: { id: true, name: true } },
        modeOfPayment: { select: { id: true, name: true } },
        _count: { select: { branches: true } },
      },
      orderBy: { name: "asc" },
    });
  },

  findById(tenantId: string, id: string) {
    return prisma.dealer.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  },

  create(
    tenantId: string,
    data: {
      name: string;
      sapCode?: string | null;
      status?: BranchStatus;
      areaId?: string | null;
      dealerTypeId?: string | null;
      dealerAreaId?: string | null;
      modeOfPaymentId?: string | null;
    },
  ) {
    return prisma.dealer.create({
      data: {
        tenantId,
        name: data.name,
        sapCode: data.sapCode ?? null,
        status: data.status ?? "active",
        areaId: data.areaId ?? null,
        dealerTypeId: data.dealerTypeId ?? null,
        dealerAreaId: data.dealerAreaId ?? null,
        modeOfPaymentId: data.modeOfPaymentId ?? null,
      },
    });
  },

  update(
    tenantId: string,
    id: string,
    data: {
      name?: string;
      sapCode?: string | null;
      status?: BranchStatus;
      areaId?: string | null;
      dealerTypeId?: string | null;
      dealerAreaId?: string | null;
      modeOfPaymentId?: string | null;
    },
  ) {
    return prisma.dealer.update({
      where: { id, tenantId },
      data,
    });
  },

  /**
   * Every dealer for the tenant, soft-deleted rows included. The SAP sync matches on
   * `sapCode`, so a soft-deleted dealer still has to be visible here — otherwise the
   * sync would try to re-create it and collide on the unique name.
   */
  listSapSyncSnapshot(tenantId: string) {
    return prisma.dealer.findMany({
      where: { tenantId },
      select: { id: true, sapCode: true, name: true, status: true },
    });
  },

  /**
   * Apply a SAP customer sync. Writes are chunked, and each chunk falls back to
   * per-row inserts if the batch is rejected, so one bad row is reported by itself
   * instead of taking the whole sync down with it.
   *
   * The rejection this is built for: `@@unique([tenantId, name])` still stands, so two
   * SAP customers sharing a `CardName` under different `CardCode`s cannot both land.
   * Those surface as failures here and get reported to the user. Dropping that
   * constraint is what lets them through — this code needs no change when it goes.
   */
  async applySapSync(
    tenantId: string,
    input: {
      create: { sapCode: string; name: string; status: BranchStatus }[];
      update: { id: string; sapCode: string; name: string; status: BranchStatus }[];
    },
  ) {
    const failures: { sapCode: string; name: string; reason: string }[] = [];
    let created = 0;
    let updated = 0;

    for (let i = 0; i < input.create.length; i += SAP_SYNC_CHUNK) {
      const chunk = input.create.slice(i, i + SAP_SYNC_CHUNK);
      try {
        const result = await prisma.dealer.createMany({
          data: chunk.map((row) => ({ tenantId, ...row })),
        });
        created += result.count;
      } catch {
        for (const row of chunk) {
          try {
            await prisma.dealer.create({ data: { tenantId, ...row } });
            created += 1;
          } catch (e) {
            failures.push({ sapCode: row.sapCode, name: row.name, reason: describeWriteError(e) });
          }
        }
      }
    }

    for (const row of input.update) {
      try {
        await prisma.dealer.update({
          where: { id: row.id, tenantId },
          data: { name: row.name, status: row.status },
        });
        updated += 1;
      } catch (e) {
        failures.push({ sapCode: row.sapCode, name: row.name, reason: describeWriteError(e) });
      }
    }

    return { created, updated, failures };
  },

  softDelete(tenantId: string, id: string) {
    return prisma.dealer.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  },
};
