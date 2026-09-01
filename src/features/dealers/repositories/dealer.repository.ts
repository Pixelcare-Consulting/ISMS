import { prisma } from "@/lib/database/client";
import { createInChunks, updateEach } from "@/features/sap/services/sap-sync-writer";
import type { SapSyncApplyResult } from "@/features/sap/types/sap-sync-entity";
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
   * Apply one page of a SAP customer sync, matched on `sapCode`.
   *
   * One indexed lookup, scoped to this page: the dealers these codes already map to.
   * Soft-deleted dealers are included — they still hold their `sapCode`.
   *
   * Names are deliberately not checked. SAP carries several customers under one
   * `CardName` and ISMS no longer requires them to be unique; see the `Dealer` model for
   * why the constraint was dropped.
   */
  async applySapSyncPage(
    tenantId: string,
    records: { sapCode: string; name: string; status: BranchStatus }[],
  ): Promise<SapSyncApplyResult> {
    // The entity is paged by CardCode, so a repeat within a page would be a SAP anomaly;
    // first occurrence wins rather than letting the two fight over the same row.
    const rows = [...new Map(records.map((row) => [row.sapCode, row])).values()];

    const existing = await prisma.dealer.findMany({
      where: { tenantId, sapCode: { in: rows.map((row) => row.sapCode) } },
      select: { id: true, sapCode: true, name: true, status: true },
    });
    const bySapCode = new Map(existing.map((dealer) => [dealer.sapCode, dealer]));

    const toCreate: { sapCode: string; name: string; status: BranchStatus }[] = [];
    const toUpdate: { id: string; sapCode: string; name: string; status: BranchStatus }[] = [];
    let unchanged = 0;

    for (const row of rows) {
      const match = bySapCode.get(row.sapCode);
      if (!match) toCreate.push(row);
      else if (match.name === row.name && match.status === row.status) unchanged += 1;
      else toUpdate.push({ id: match.id, ...row });
    }

    const inserted = await createInChunks(toCreate, {
      createMany: async (chunk) => {
        const result = await prisma.dealer.createMany({
          data: chunk.map((row) => ({ tenantId, ...row })),
        });
        return result.count;
      },
      createOne: async (row) => {
        await prisma.dealer.create({ data: { tenantId, ...row } });
      },
      describe: (row) => row.sapCode,
    });

    const changed = await updateEach(toUpdate, {
      updateOne: async (row) => {
        await prisma.dealer.update({
          where: { id: row.id, tenantId },
          data: { name: row.name, status: row.status },
        });
      },
      describe: (row) => row.sapCode,
    });

    return {
      created: inserted.created,
      updated: changed.updated,
      unchanged,
      failures: [...inserted.failures, ...changed.failures],
    };
  },

  softDelete(tenantId: string, id: string) {
    return prisma.dealer.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  },
};
