import { Prisma } from "@/lib/database/generated/prisma/client";
import { prisma } from "@/lib/database/client";

import { PIXELCARE_AI_LIMITS } from "@/features/pixelcare-ai/constants/limits";

function ownerWhere(tenantId: string, userId: string, id?: string) {
  return {
    ...(id ? { id } : {}),
    tenantId,
    userId,
    deletedAt: null,
  };
}

export const conversationRepository = {
  listForOwner(tenantId: string, userId: string, take = 40) {
    return prisma.aiConversation.findMany({
      where: ownerWhere(tenantId, userId),
      orderBy: [
        { pinnedAt: { sort: "desc", nulls: "last" } },
        { updatedAt: "desc" },
      ],
      take,
      select: {
        id: true,
        title: true,
        contextJson: true,
        pinnedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  findOwned(tenantId: string, userId: string, id: string) {
    return prisma.aiConversation.findFirst({
      where: ownerWhere(tenantId, userId, id),
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: PIXELCARE_AI_LIMITS.maxContextMessages,
        },
      },
    });
  },

  findOwnedMeta(tenantId: string, userId: string, id: string) {
    return prisma.aiConversation.findFirst({
      where: ownerWhere(tenantId, userId, id),
    });
  },

  create(input: {
    tenantId: string;
    userId: string;
    title?: string;
    contextJson?: Prisma.InputJsonValue;
  }) {
    return prisma.aiConversation.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        title: input.title?.slice(0, PIXELCARE_AI_LIMITS.maxTitleChars) || "New conversation",
        ...(input.contextJson !== undefined ? { contextJson: input.contextJson } : {}),
      },
    });
  },

  async updateOwned(
    tenantId: string,
    userId: string,
    id: string,
    data: {
      title?: string;
      contextJson?: Prisma.InputJsonValue | null;
      /** Set Date to pin; null to unpin; omit to leave unchanged. */
      pinnedAt?: Date | null;
    },
  ) {
    const existing = await prisma.aiConversation.findFirst({
      where: ownerWhere(tenantId, userId, id),
      select: { id: true },
    });
    if (!existing) return { count: 0 };

    await prisma.aiConversation.update({
      where: { id },
      data: {
        ...(data.title !== undefined
          ? { title: data.title.slice(0, PIXELCARE_AI_LIMITS.maxTitleChars) }
          : {}),
        ...(data.contextJson !== undefined
          ? {
              // null = Clear context (persist empty); omit key when undefined.
              contextJson:
                data.contextJson === null ? Prisma.DbNull : data.contextJson,
            }
          : {}),
        ...(data.pinnedAt !== undefined ? { pinnedAt: data.pinnedAt } : {}),
      },
    });
    return { count: 1 };
  },

  softDeleteOwned(tenantId: string, userId: string, id: string) {
    return prisma.aiConversation.updateMany({
      where: ownerWhere(tenantId, userId, id),
      data: { deletedAt: new Date() },
    });
  },

  listRecentMessages(
    conversationId: string,
    take: number = PIXELCARE_AI_LIMITS.maxContextMessages,
  ) {
    return prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take,
    });
  },

  createMessage(input: {
    conversationId: string;
    role: "user" | "assistant" | "tool";
    content: string;
    toolName?: string | null;
    toolPayload?: Prisma.InputJsonValue | null;
  }) {
    return prisma.aiMessage.create({
      data: {
        conversationId: input.conversationId,
        role: input.role,
        content: input.content.slice(0, PIXELCARE_AI_LIMITS.maxMessageChars * 4),
        toolName: input.toolName ?? undefined,
        toolPayload: input.toolPayload ?? undefined,
      },
    });
  },

  touch(conversationId: string) {
    return prisma.aiConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  },
};
