import type { StockCountSessionStatus } from "@prisma/client";

import {
  isPcountDoneStatus,
  resolvePcountDualStatus,
  type PcountCountingLabel,
  type PcountPostingLabel,
} from "@/features/stock-audit/constants/pcount-dashboard";
import { aorService } from "@/features/aors/services/aor.service";
import { manilaMonthWindow } from "@/features/orders/utils/manila-calendar";
import { prisma } from "@/lib/database/client";

export interface PcountDashboardKpis {
  branchesDone: number;
  branchesActive: number;
  countingOpen: number;
  readyToPost: number;
  pendingSap: number;
}

export interface PcountBranchRow {
  branchId: string;
  branchName: string;
  branchSapCode: string;
  counting: PcountCountingLabel;
  posting: PcountPostingLabel;
  sessionStatus: StockCountSessionStatus | null;
  latestSessionId: string | null;
  latestSessionNo: string | null;
  isDone: boolean;
  isPostable: boolean;
  isPendingSap: boolean;
  isCountingOpen: boolean;
  lastClosedAt: Date | null;
  lastCountByName: string | null;
}

export interface PcountDealerGroup {
  groupKey: string;
  groupCode: string;
  groupName: string;
  dealerId: string | null;
  branchesDone: number;
  branchesActive: number;
  countingOpen: number;
  readyToPost: number;
  notStarted: number;
  branches: PcountBranchRow[];
}

export interface PcountDashboardOverview {
  period: {
    year: number;
    month: number;
    /** e.g. Sep 2026 */
    label: string;
    start: Date;
    endExclusive: Date;
  };
  kpis: PcountDashboardKpis;
  groups: PcountDealerGroup[];
  dealers: { id: string; name: string; sapCode: string | null }[];
}

export interface PcountBranchDetailSession {
  id: string;
  sessionNo: string;
  status: StockCountSessionStatus;
  counting: PcountCountingLabel;
  posting: PcountPostingLabel;
  createdAt: Date;
  closedAt: Date | null;
  createdByName: string | null;
  sapDocRef: string | null;
  isPostable: boolean;
}

export interface PcountBranchDetail {
  branchId: string;
  branchName: string;
  branchSapCode: string;
  lastCountByName: string | null;
  lastClosedAt: Date | null;
  currentCounting: PcountCountingLabel;
  currentPosting: PcountPostingLabel;
  latestSessionId: string | null;
  canPostDifferences: boolean;
  sessions: PcountBranchDetailSession[];
}

function monthLabel(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Parse `YYYY-MM` into Manila month window; default = current Manila month. */
export function resolvePcountPeriod(period?: string | null): {
  year: number;
  month: number;
  label: string;
  start: Date;
  endExclusive: Date;
} {
  if (period && /^\d{4}-\d{2}$/.test(period)) {
    const year = Number(period.slice(0, 4));
    const month = Number(period.slice(5, 7));
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
      const start = new Date(Date.UTC(year, month - 1, 1, -8, 0, 0, 0));
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const endExclusive = new Date(Date.UTC(nextYear, nextMonth - 1, 1, -8, 0, 0, 0));
      return { year, month, label: monthLabel(year, month), start, endExclusive };
    }
  }
  const w = manilaMonthWindow();
  return {
    year: w.year,
    month: w.month,
    label: monthLabel(w.year, w.month),
    start: w.start,
    endExclusive: w.endExclusive,
  };
}

function sessionInPeriod(
  session: { createdAt: Date; closedAt: Date | null },
  start: Date,
  endExclusive: Date,
): boolean {
  const startMs = start.getTime();
  const endMs = endExclusive.getTime();
  if (session.closedAt) {
    const closedMs = session.closedAt.getTime();
    if (closedMs >= startMs && closedMs < endMs) return true;
  }
  const createdMs = session.createdAt.getTime();
  return createdMs >= startMs && createdMs < endMs;
}

function groupMeta(branch: {
  dealer: { id: string; name: string; sapCode: string | null } | null;
  branchArea: { id: string; name: string } | null;
}): { groupKey: string; groupCode: string; groupName: string; dealerId: string | null } {
  if (branch.dealer) {
    const code = branch.dealer.sapCode?.trim() || branch.dealer.name;
    return {
      groupKey: `dealer:${branch.dealer.id}`,
      groupCode: code,
      groupName: branch.dealer.name,
      dealerId: branch.dealer.id,
    };
  }
  if (branch.branchArea) {
    return {
      groupKey: `area:${branch.branchArea.id}`,
      groupCode: branch.branchArea.name,
      groupName: branch.branchArea.name,
      dealerId: null,
    };
  }
  return {
    groupKey: "ungrouped",
    groupCode: "Ungrouped",
    groupName: "Ungrouped",
    dealerId: null,
  };
}

export const pcountDashboardService = {
  async getOverview(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
    filters?: { period?: string | null; dealerId?: string | null },
  ): Promise<PcountDashboardOverview> {
    const period = resolvePcountPeriod(filters?.period);
    const branchIds = isUnrestricted
      ? undefined
      : await aorService.getBranchIdsForUser(tenantId, userId);

    if (!isUnrestricted && (!branchIds || branchIds.length === 0)) {
      return {
        period,
        kpis: {
          branchesDone: 0,
          branchesActive: 0,
          countingOpen: 0,
          readyToPost: 0,
          pendingSap: 0,
        },
        groups: [],
        dealers: [],
      };
    }

    const branches = await prisma.branch.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: "active",
        ...(branchIds?.length ? { id: { in: branchIds } } : {}),
        ...(filters?.dealerId ? { dealerId: filters.dealerId } : {}),
      },
      select: {
        id: true,
        name: true,
        sapCode: true,
        dealerId: true,
        dealer: { select: { id: true, name: true, sapCode: true } },
        branchArea: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });

    const scopedBranchIds = branches.map((b) => b.id);

    const sessions =
      scopedBranchIds.length === 0
        ? []
        : await prisma.stockCountSession.findMany({
            where: {
              tenantId,
              branchId: { in: scopedBranchIds },
              OR: [
                {
                  createdAt: {
                    gte: period.start,
                    lt: period.endExclusive,
                  },
                },
                {
                  closedAt: {
                    gte: period.start,
                    lt: period.endExclusive,
                  },
                },
              ],
            },
            select: {
              id: true,
              branchId: true,
              sessionNo: true,
              status: true,
              createdAt: true,
              closedAt: true,
              createdBy: { select: { name: true, email: true } },
            },
            orderBy: { createdAt: "desc" },
          });

    const sessionsByBranch = new Map<string, typeof sessions>();
    for (const session of sessions) {
      if (!sessionInPeriod(session, period.start, period.endExclusive)) continue;
      const list = sessionsByBranch.get(session.branchId) ?? [];
      list.push(session);
      sessionsByBranch.set(session.branchId, list);
    }

    const groupMap = new Map<string, PcountDealerGroup>();

    let branchesDone = 0;
    let countingOpen = 0;
    let readyToPost = 0;
    let pendingSap = 0;

    for (const branch of branches) {
      const meta = groupMeta(branch);
      let group = groupMap.get(meta.groupKey);
      if (!group) {
        group = {
          groupKey: meta.groupKey,
          groupCode: meta.groupCode,
          groupName: meta.groupName,
          dealerId: meta.dealerId,
          branchesDone: 0,
          branchesActive: 0,
          countingOpen: 0,
          readyToPost: 0,
          notStarted: 0,
          branches: [],
        };
        groupMap.set(meta.groupKey, group);
      }

      const branchSessions = sessionsByBranch.get(branch.id) ?? [];
      const latest = branchSessions[0] ?? null;
      const dual = resolvePcountDualStatus(latest?.status);
      const doneThisMonth = branchSessions.some((s) => isPcountDoneStatus(s.status));
      const closedSession = branchSessions.find((s) => s.closedAt);
      const lastClosedAt =
        closedSession?.closedAt ??
        (latest?.status === "closed" ? latest.closedAt : null);

      const row: PcountBranchRow = {
        branchId: branch.id,
        branchName: branch.name,
        branchSapCode: branch.sapCode,
        counting: dual.counting,
        posting: dual.posting,
        sessionStatus: latest?.status ?? null,
        latestSessionId: latest?.id ?? null,
        latestSessionNo: latest?.sessionNo ?? null,
        isDone: doneThisMonth,
        isPostable: dual.isPostable,
        isPendingSap: dual.isPendingSap,
        isCountingOpen: dual.isCountingOpen,
        lastClosedAt,
        lastCountByName: latest?.createdBy.name ?? latest?.createdBy.email ?? null,
      };

      group.branches.push(row);
      group.branchesActive += 1;
      if (doneThisMonth) {
        group.branchesDone += 1;
        branchesDone += 1;
      }
      if (dual.isCountingOpen) {
        group.countingOpen += 1;
        countingOpen += 1;
      }
      if (dual.isPostable) {
        group.readyToPost += 1;
        readyToPost += 1;
      }
      if (dual.isPendingSap) {
        pendingSap += 1;
      }
      if (!latest) {
        group.notStarted += 1;
      }
    }

    const groups = Array.from(groupMap.values()).sort((a, b) =>
      a.groupCode.localeCompare(b.groupCode, undefined, { sensitivity: "base" }),
    );

    const dealerIds = new Set(
      branches.map((b) => b.dealer?.id).filter((id): id is string => Boolean(id)),
    );
    const dealers = Array.from(
      new Map(
        branches
          .filter((b) => b.dealer && dealerIds.has(b.dealer.id))
          .map((b) => [
            b.dealer!.id,
            {
              id: b.dealer!.id,
              name: b.dealer!.name,
              sapCode: b.dealer!.sapCode,
            },
          ]),
      ).values(),
    ).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    return {
      period,
      kpis: {
        branchesDone,
        branchesActive: branches.length,
        countingOpen,
        readyToPost,
        pendingSap,
      },
      groups,
      dealers,
    };
  },

  async getBranchDetail(
    tenantId: string,
    userId: string,
    isUnrestricted: boolean,
    branchId: string,
  ): Promise<PcountBranchDetail | null> {
    if (!isUnrestricted) {
      const branchIds = await aorService.getBranchIdsForUser(tenantId, userId);
      if (!branchIds.includes(branchId)) return null;
    }

    const branch = await prisma.branch.findFirst({
      where: { id: branchId, tenantId, deletedAt: null },
      select: { id: true, name: true, sapCode: true },
    });
    if (!branch) return null;

    const sessions = await prisma.stockCountSession.findMany({
      where: { tenantId, branchId },
      select: {
        id: true,
        sessionNo: true,
        status: true,
        createdAt: true,
        closedAt: true,
        createdBy: { select: { name: true, email: true } },
        variances: {
          where: { sapDocRef: { not: null } },
          select: { sapDocRef: true },
          take: 1,
          orderBy: { updatedAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    const mapped = sessions.map((s) => {
      const dual = resolvePcountDualStatus(s.status);
      return {
        id: s.id,
        sessionNo: s.sessionNo,
        status: s.status,
        counting: dual.counting,
        posting: dual.posting,
        createdAt: s.createdAt,
        closedAt: s.closedAt,
        createdByName: s.createdBy.name ?? s.createdBy.email,
        sapDocRef: s.variances[0]?.sapDocRef ?? null,
        isPostable: dual.isPostable,
      };
    });

    const latest = mapped[0] ?? null;
    const lastClosed = mapped.find((s) => s.closedAt);

    return {
      branchId: branch.id,
      branchName: branch.name,
      branchSapCode: branch.sapCode,
      lastCountByName: latest?.createdByName ?? null,
      lastClosedAt: lastClosed?.closedAt ?? null,
      currentCounting: latest?.counting ?? "Not started",
      currentPosting: latest?.posting ?? "—",
      latestSessionId: latest?.id ?? null,
      canPostDifferences: Boolean(latest?.isPostable),
      sessions: mapped,
    };
  },
};
