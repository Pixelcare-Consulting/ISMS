import type {
  NotificationAudience,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/database/client";

type VisibleForUserParams = {
  tenantId: string;
  userId: string;
  roleSlugs: string[];
  limit?: number;
  offset?: number;
};

function audienceMatchFilter(
  userId: string,
  roleSlugs: string[],
): Prisma.NotificationWhereInput {
  const roleOrUser: Prisma.NotificationWhereInput[] = [
    { audience: "TENANT" },
    { audience: "USER", userId },
  ];

  if (roleSlugs.length > 0) {
    roleOrUser.push({
      audience: "ROLE",
      roleSlug: { in: roleSlugs },
    });
  }

  return { OR: roleOrUser };
}

function activeNotificationFilter(
  tenantId: string,
  userId: string,
  roleSlugs: string[],
): Prisma.NotificationWhereInput {
  const now = new Date();
  return {
    tenantId,
    deletedAt: null,
    AND: [
      {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      audienceMatchFilter(userId, roleSlugs),
      {
        NOT: {
          states: {
            some: {
              userId,
              dismissedAt: { not: null },
            },
          },
        },
      },
    ],
  };
}

function unreadForUserFilter(userId: string): Prisma.NotificationWhereInput {
  return {
    OR: [
      { states: { none: { userId } } },
      {
        states: {
          some: {
            userId,
            readAt: null,
          },
        },
      },
    ],
  };
}

const inboxSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  href: true,
  audience: true,
  createdAt: true,
  states: {
    select: {
      readAt: true,
    },
  },
} satisfies Prisma.NotificationSelect;

export type NotificationInboxItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  audience: NotificationAudience;
  createdAt: Date;
  readAt: Date | null;
};

function mapInboxRow(
  row: {
    id: string;
    type: string;
    title: string;
    body: string | null;
    href: string | null;
    audience: NotificationAudience;
    createdAt: Date;
    states: { readAt: Date | null }[];
  },
): NotificationInboxItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    audience: row.audience,
    createdAt: row.createdAt,
    readAt: row.states[0]?.readAt ?? null,
  };
}

export const notificationRepository = {
  create(data: {
    tenantId: string;
    audience: NotificationAudience;
    roleSlug?: string | null;
    userId?: string | null;
    type: string;
    title: string;
    body?: string | null;
    href?: string | null;
    metadata?: Prisma.InputJsonValue | null;
    createdById?: string | null;
    expiresAt?: Date | null;
  }) {
    return prisma.notification.create({
      data: {
        tenantId: data.tenantId,
        audience: data.audience,
        roleSlug: data.audience === "ROLE" ? data.roleSlug ?? null : null,
        userId: data.audience === "USER" ? data.userId ?? null : null,
        type: data.type,
        title: data.title,
        body: data.body ?? null,
        href: data.href ?? null,
        metadata: data.metadata ?? undefined,
        createdById: data.createdById ?? null,
        expiresAt: data.expiresAt ?? null,
      },
    });
  },

  async listVisibleForUser(
    params: VisibleForUserParams,
  ): Promise<{ items: NotificationInboxItem[]; total: number }> {
    const limit = params.limit ?? 5;
    const offset = params.offset ?? 0;
    const where = activeNotificationFilter(
      params.tenantId,
      params.userId,
      params.roleSlugs,
    );

    const [rows, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        select: {
          ...inboxSelect,
          states: {
            where: { userId: params.userId },
            select: { readAt: true },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({ where }),
    ]);

    return { items: rows.map(mapInboxRow), total };
  },

  countUnreadForUser(params: Omit<VisibleForUserParams, "limit" | "offset">) {
    return prisma.notification.count({
      where: {
        AND: [
          activeNotificationFilter(
            params.tenantId,
            params.userId,
            params.roleSlugs,
          ),
          unreadForUserFilter(params.userId),
        ],
      },
    });
  },

  findVisibleById(params: {
    tenantId: string;
    userId: string;
    roleSlugs: string[];
    notificationId: string;
  }) {
    return prisma.notification.findFirst({
      where: {
        id: params.notificationId,
        ...activeNotificationFilter(
          params.tenantId,
          params.userId,
          params.roleSlugs,
        ),
      },
      select: { id: true },
    });
  },

  async markRead(params: {
    notificationId: string;
    userId: string;
  }) {
    const now = new Date();
    return prisma.notificationState.upsert({
      where: {
        notificationId_userId: {
          notificationId: params.notificationId,
          userId: params.userId,
        },
      },
      create: {
        notificationId: params.notificationId,
        userId: params.userId,
        readAt: now,
      },
      update: {
        readAt: now,
      },
    });
  },

  async markAllRead(params: {
    tenantId: string;
    userId: string;
    roleSlugs: string[];
  }) {
    const unread = await prisma.notification.findMany({
      where: {
        AND: [
          activeNotificationFilter(
            params.tenantId,
            params.userId,
            params.roleSlugs,
          ),
          unreadForUserFilter(params.userId),
        ],
      },
      select: { id: true },
    });

    if (unread.length === 0) return { count: 0 };

    const now = new Date();
    await prisma.$transaction(
      unread.map((row) =>
        prisma.notificationState.upsert({
          where: {
            notificationId_userId: {
              notificationId: row.id,
              userId: params.userId,
            },
          },
          create: {
            notificationId: row.id,
            userId: params.userId,
            readAt: now,
          },
          update: {
            readAt: now,
          },
        }),
      ),
    );

    return { count: unread.length };
  },
};
