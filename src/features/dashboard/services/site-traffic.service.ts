import { manilaMonthWindow } from "@/features/orders/utils/manila-calendar";
import { prisma } from "@/lib/database/client";

export interface SiteTrafficKpis {
  totalUsers: number;
  activeUsers: number;
  loginUsers: number;
  totalPs: number;
  activePs: number;
  loginPs: number;
}

export interface SiteTrafficRecentUser {
  userId: string;
  userName: string;
  email: string;
  roleLabel: string;
  branchLabel: string;
  isLogin: boolean;
  lastAccess: string;
  lastSeenAt: Date;
}

export interface SiteTrafficPageRow {
  location: string;
  count: number;
  lastSeenAt: Date;
}

export interface SiteTrafficTopPsRow {
  userId: string;
  userName: string;
  branchName: string;
  count: number;
}

export interface SiteTrafficOverview {
  kpis: SiteTrafficKpis;
  recentUsers: SiteTrafficRecentUser[];
  pages: SiteTrafficPageRow[];
  topPs: SiteTrafficTopPsRow[];
  topPsPeriodLabel: string;
  topPsTotalSales: number;
  pagesNote: string;
}

const LOGIN_FRESH_MS = 15 * 60 * 1000;

function roleLabel(
  roles: { role: { name: string; slug: string } }[],
): string {
  if (!roles.length) return "—";
  return roles.map((r) => r.role.name).join(", ");
}

function isPsRole(roles: { role: { slug: string } }[]): boolean {
  return roles.some((r) => r.role.slug === "ps");
}

export const siteTrafficService = {
  async getOverview(tenantId: string): Promise<SiteTrafficOverview> {
    const now = new Date();
    const loginCutoff = new Date(now.getTime() - LOGIN_FRESH_MS);
    const month = manilaMonthWindow(now);

    const [
      totalUsers,
      activeUsers,
      loginSessions,
      totalPs,
      activePsUsers,
      recentSessions,
      recentAudits,
      topPsGroups,
      topPsTotalSales,
    ] = await Promise.all([
      prisma.user.count({
        where: { tenantId, deletedAt: null },
      }),
      prisma.user.count({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { sessions: { some: { expiresAt: { gt: now } } } },
            { updatedAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
          ],
        },
      }),
      prisma.session.findMany({
        where: {
          expiresAt: { gt: now },
          updatedAt: { gte: loginCutoff },
          user: { tenantId, deletedAt: null },
        },
        select: {
          userId: true,
          updatedAt: true,
          user: {
            select: {
              userRoles: { select: { role: { select: { slug: true } } } },
            },
          },
        },
      }),
      prisma.user.count({
        where: {
          tenantId,
          deletedAt: null,
          userRoles: { some: { role: { slug: "ps" } } },
        },
      }),
      prisma.user.count({
        where: {
          tenantId,
          deletedAt: null,
          userRoles: { some: { role: { slug: "ps" } } },
          OR: [
            { sessions: { some: { expiresAt: { gt: now } } } },
            { updatedAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
          ],
        },
      }),
      prisma.session.findMany({
        where: {
          user: { tenantId, deletedAt: null },
        },
        orderBy: { updatedAt: "desc" },
        take: 40,
        select: {
          userId: true,
          updatedAt: true,
          expiresAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              userRoles: {
                select: { role: { select: { name: true, slug: true } } },
              },
              aors: {
                where: { branchId: { not: null } },
                take: 1,
                select: {
                  branch: { select: { name: true, sapCode: true } },
                },
              },
            },
          },
        },
      }),
      prisma.auditLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          action: true,
          entityType: true,
          createdAt: true,
        },
      }),
      prisma.branchSalesTransaction.groupBy({
        by: ["createdById", "branchId"],
        where: {
          tenantId,
          createdById: { not: null },
          createdAt: { gte: month.start, lt: month.endExclusive },
        },
        _count: { _all: true },
        orderBy: { _count: { createdById: "desc" } },
        take: 40,
      }),
      prisma.branchSalesTransaction.count({
        where: {
          tenantId,
          createdAt: { gte: month.start, lt: month.endExclusive },
        },
      }),
    ]);

    const loginUserIds = new Set(loginSessions.map((s) => s.userId));
    const loginPsIds = new Set(
      loginSessions
        .filter((s) => isPsRole(s.user.userRoles))
        .map((s) => s.userId),
    );
    const loginPs = loginPsIds.size;

    const seenUsers = new Set<string>();
    const recentUsers: SiteTrafficRecentUser[] = [];
    for (const session of recentSessions) {
      if (seenUsers.has(session.userId)) continue;
      seenUsers.add(session.userId);
      const branch = session.user.aors[0]?.branch;
      recentUsers.push({
        userId: session.userId,
        userName: session.user.name || session.user.email,
        email: session.user.email,
        roleLabel: roleLabel(session.user.userRoles),
        branchLabel: branch
          ? `${branch.name}${branch.sapCode ? ` (${branch.sapCode})` : ""}`
          : "—",
        isLogin: session.expiresAt > now && session.updatedAt >= loginCutoff,
        lastAccess: "Session activity",
        lastSeenAt: session.updatedAt,
      });
      if (recentUsers.length >= 25) break;
    }

    const pageMap = new Map<string, { count: number; lastSeenAt: Date }>();
    for (const log of recentAudits) {
      const location = `${log.entityType}/${log.action}`.toUpperCase();
      const existing = pageMap.get(location);
      if (existing) {
        existing.count += 1;
        if (log.createdAt > existing.lastSeenAt) {
          existing.lastSeenAt = log.createdAt;
        }
      } else {
        pageMap.set(location, { count: 1, lastSeenAt: log.createdAt });
      }
    }
    const pages = Array.from(pageMap.entries())
      .map(([location, v]) => ({ location, ...v }))
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .slice(0, 30);

    const userIds = [
      ...new Set(
        topPsGroups
          .map((g) => g.createdById)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const branchIds = [
      ...new Set(topPsGroups.map((g) => g.branchId).filter(Boolean)),
    ];

    const [saleUsers, branches] = await Promise.all([
      userIds.length
        ? prisma.user.findMany({
            where: { id: { in: userIds }, tenantId },
            select: {
              id: true,
              name: true,
              email: true,
              userRoles: { select: { role: { select: { slug: true } } } },
            },
          })
        : Promise.resolve(
            [] as {
              id: string;
              name: string;
              email: string;
              userRoles: { role: { slug: string } }[];
            }[],
          ),
      branchIds.length
        ? prisma.branch.findMany({
            where: { id: { in: branchIds }, tenantId },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as { id: string; name: string }[]),
    ]);

    const userMap = new Map(saleUsers.map((u) => [u.id, u]));
    const branchMap = new Map(branches.map((b) => [b.id, b.name]));

    // Aggregate sales count per user (sum across branches), prefer PS role when present.
    const byUser = new Map<
      string,
      { userName: string; branchName: string; count: number; isPs: boolean }
    >();
    for (const g of topPsGroups) {
      if (!g.createdById) continue;
      const user = userMap.get(g.createdById);
      if (!user) continue;
      const existing = byUser.get(g.createdById);
      const branchName = branchMap.get(g.branchId) ?? "—";
      const count = g._count._all;
      if (!existing) {
        byUser.set(g.createdById, {
          userName: user.name || user.email,
          branchName,
          count,
          isPs: isPsRole(user.userRoles),
        });
      } else {
        existing.count += count;
        if (count >= existing.count - count) {
          existing.branchName = branchName;
        }
      }
    }

    const topPs = Array.from(byUser.entries())
      .map(([userId, v]) => ({
        userId,
        userName: v.userName,
        branchName: v.branchName,
        count: v.count,
        isPs: v.isPs,
      }))
      .sort((a, b) => {
        if (a.isPs !== b.isPs) return a.isPs ? -1 : 1;
        return b.count - a.count;
      })
      .slice(0, 25)
      .map(({ userId, userName, branchName, count }) => ({
        userId,
        userName,
        branchName,
        count,
      }));

    const periodLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(month.start);

    const periodEndLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(month.endExclusive.getTime() - 1));

    return {
      kpis: {
        totalUsers,
        activeUsers,
        loginUsers: loginUserIds.size,
        totalPs,
        activePs: activePsUsers,
        loginPs,
      },
      recentUsers,
      pages,
      topPs,
      topPsPeriodLabel: `${periodLabel} – ${periodEndLabel}`,
      topPsTotalSales,
      pagesNote:
        "Page paths are not instrumented yet. This tab shows recent audit activity (entity/action) instead of URL hits.",
    };
  },
};
