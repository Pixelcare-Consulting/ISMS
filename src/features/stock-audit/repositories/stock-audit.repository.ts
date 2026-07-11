import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
} from "@/lib/shared/pagination";
import type { Prisma } from "@prisma/client";

const sessionListInclude = {
  branch: { select: { id: true, name: true, sapCode: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  _count: { select: { lines: true, variances: true } },
} satisfies Prisma.StockCountSessionInclude;

const sessionDetailInclude = {
  branch: { select: { id: true, name: true, sapCode: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  lines: {
    orderBy: { serialNumber: { serialNo: "asc" } },
    include: {
      serialNumber: { select: { id: true, serialNo: true } },
      model: {
        select: {
          id: true,
          skuCode: true,
          name: true,
          brand: { select: { name: true } },
        },
      },
      countedBy: { select: { name: true, email: true } },
      variance: true,
    },
  },
  variances: {
    orderBy: { createdAt: "asc" },
    include: {
      line: {
        include: {
          serialNumber: { select: { serialNo: true } },
          model: { select: { skuCode: true, name: true } },
        },
      },
      investigatedBy: { select: { name: true, email: true } },
      adjustmentRequestedBy: { select: { name: true, email: true } },
    },
  },
} satisfies Prisma.StockCountSessionInclude;

export const stockAuditRepository = {
  listSessions(
    tenantId: string,
    branchIds: string[] | undefined,
    pagination?: { page?: number },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.StockCountSessionWhereInput = {
      tenantId,
      ...(branchIds?.length ? { branchId: { in: branchIds } } : {}),
    };

    return Promise.all([
      prisma.stockCountSession.findMany({
        where,
        include: sessionListInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.stockCountSession.count({ where }),
    ]).then(([items, total]) => toPaginatedResult(items, total, page, limit));
  },

  findSessionById(tenantId: string, sessionId: string) {
    return prisma.stockCountSession.findFirst({
      where: { id: sessionId, tenantId },
      include: sessionDetailInclude,
    });
  },

  createSession(data: {
    tenantId: string;
    branchId: string;
    sessionNo: string;
    createdById: string;
  }) {
    return prisma.stockCountSession.create({
      data: {
        tenantId: data.tenantId,
        branchId: data.branchId,
        sessionNo: data.sessionNo,
        createdById: data.createdById,
        status: "draft",
      },
      include: sessionListInclude,
    });
  },

  updateSessionStatus(
    tenantId: string,
    sessionId: string,
    status: Prisma.StockCountSessionUpdateInput["status"],
    extra?: { closedAt?: Date },
  ) {
    return prisma.stockCountSession.update({
      where: { id: sessionId, tenantId },
      data: { status, ...extra },
    });
  },

  createLines(
    lines: Prisma.StockCountLineCreateManyInput[],
  ) {
    return prisma.stockCountLine.createMany({ data: lines });
  },

  findLine(sessionId: string, lineId: string) {
    return prisma.stockCountLine.findFirst({
      where: { id: lineId, sessionId },
    });
  },

  markLineCounted(lineId: string, userId: string) {
    return prisma.stockCountLine.update({
      where: { id: lineId },
      data: {
        status: "counted",
        countedAt: new Date(),
        countedById: userId,
      },
    });
  },

  createVariance(data: Prisma.StockVarianceUncheckedCreateInput) {
    return prisma.stockVariance.create({ data });
  },

  /** Atomically mark all pending lines as variances and advance session status. */
  completeCountingTx(
    tenantId: string,
    sessionId: string,
    pendingLineIds: string[],
    variance: Omit<Prisma.StockVarianceUncheckedCreateInput, "lineId">,
    nextStatus: Prisma.StockCountSessionUpdateInput["status"],
  ) {
    return prisma.$transaction(async (tx) => {
      for (const lineId of pendingLineIds) {
        await tx.stockCountLine.update({
          where: { id: lineId },
          data: { status: "variance" },
        });
        await tx.stockVariance.create({ data: { ...variance, lineId } });
      }
      await tx.stockCountSession.update({
        where: { id: sessionId, tenantId },
        data: { status: nextStatus },
      });
    });
  },

  updateVariance(
    tenantId: string,
    varianceId: string,
    data: Prisma.StockVarianceUncheckedUpdateInput,
  ) {
    return prisma.stockVariance.update({
      where: { id: varianceId, tenantId },
      data,
    });
  },

  findVariance(tenantId: string, varianceId: string) {
    return prisma.stockVariance.findFirst({
      where: { id: varianceId, tenantId },
      include: { session: { select: { id: true, sessionNo: true, branchId: true } } },
    });
  },

  countPendingLines(sessionId: string) {
    return prisma.stockCountLine.count({
      where: { sessionId, status: "pending" },
    });
  },

  /**
   * Close session and write SerialNumberHistory (txnType: pcount) for counted serials.
   */
  closeSessionWithPcountHistory(
    tenantId: string,
    sessionId: string,
    userId: string,
    sessionNo: string,
    closedAt: Date,
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.stockCountSession.update({
        where: { id: sessionId, tenantId },
        data: { status: "closed", closedAt },
      });

      const countedLines = await tx.stockCountLine.findMany({
        where: {
          sessionId,
          countedAt: { not: null },
        },
        select: { serialNumberId: true, status: true },
      });

      if (countedLines.length === 0) return { historyCount: 0 };

      await tx.serialNumberHistory.createMany({
        data: countedLines.map((line) => ({
          tenantId,
          serialNumberId: line.serialNumberId,
          txnType: "pcount" as const,
          details: `P-Count session ${sessionNo}`,
          status: line.status,
          createdById: userId,
          createdAt: closedAt,
        })),
      });

      return { historyCount: countedLines.length };
    });
  },

  listClosedSessions(
    tenantId: string,
    filters: {
      /** `undefined` = all branches; `[]` = no access (empty result). */
      branchIds?: string[];
      branchId?: string;
      from?: Date;
      to?: Date;
    },
    pagination?: { page?: number },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);

    if (filters.branchIds && filters.branchIds.length === 0) {
      return Promise.resolve(toPaginatedResult([], 0, page, limit));
    }

    if (
      filters.branchId &&
      filters.branchIds &&
      !filters.branchIds.includes(filters.branchId)
    ) {
      return Promise.resolve(toPaginatedResult([], 0, page, limit));
    }

    const where: Prisma.StockCountSessionWhereInput = {
      tenantId,
      status: "closed",
      ...(filters.branchId
        ? { branchId: filters.branchId }
        : filters.branchIds
          ? { branchId: { in: filters.branchIds } }
          : {}),
      ...(filters.from || filters.to
        ? {
            closedAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };

    return Promise.all([
      prisma.stockCountSession.findMany({
        where,
        include: {
          ...sessionListInclude,
          lines: {
            select: { status: true, countedAt: true },
          },
        },
        orderBy: [{ closedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.stockCountSession.count({ where }),
    ]).then(([items, total]) => {
      const mapped = items.map((session) => {
        const countedCount = session.lines.filter((l) => l.countedAt != null).length;
        const { lines: _lines, ...rest } = session;
        return {
          ...rest,
          countedCount,
          varianceCount: session._count.variances,
          lineCount: session._count.lines,
        };
      });
      return toPaginatedResult(mapped, total, page, limit);
    });
  },
};
