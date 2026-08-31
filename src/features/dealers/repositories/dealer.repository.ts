import { prisma } from "@/lib/database/client";
import {
  describeWriteError,
  SAP_SYNC_CHUNK,
  SAP_SYNC_WRITE_CONCURRENCY,
} from "@/features/sap/services/sap-master-data";
import { mapWithConcurrency } from "@/lib/shared/concurrency";
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
   * The rejection this was built for — `@@unique([tenantId, name])` blocking two SAP
   * customers that share a `CardName` — is now caught before the write, in
   * `dealer-sap-sync.service.ts`, because reaching it here costs a rejected 500-row
   * `createMany` plus 500 single-row retries to find a handful of offenders. This
   * fallback stays as a safety net for write errors the caller could not predict; if
   * it fires often, something is getting past the pre-flight check and that is the
   * thing to fix.
   *
   * Dropping the name constraint is what lets duplicates through — neither this code
   * nor the pre-flight check needs changing when it goes, the skips simply stop.
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

    // Updates carry per-row values so they cannot be batched, but they are
    // independent of each other — run them `SAP_SYNC_WRITE_CONCURRENCY` wide instead
    // of one round trip at a time. Results come back in input order, so the failure
    // report stays deterministic.
    const outcomes = await mapWithConcurrency(
      input.update,
      SAP_SYNC_WRITE_CONCURRENCY,
      async (row) => {
        try {
          await prisma.dealer.update({
            where: { id: row.id, tenantId },
            data: { name: row.name, status: row.status },
          });
          return null;
        } catch (e) {
          return { sapCode: row.sapCode, name: row.name, reason: describeWriteError(e) };
        }
      },
    );
    for (const outcome of outcomes) {
      if (outcome) failures.push(outcome);
      else updated += 1;
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
