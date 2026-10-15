import type { Prisma } from "@/lib/database/generated/prisma/client";

import { PIXELCARE_AI_LIMITS } from "@/features/pixelcare-ai/constants/limits";
import { conversationRepository } from "@/features/pixelcare-ai/repositories/conversation.repository";
import type { PixelcareAiContext } from "@/features/pixelcare-ai/schemas/context.schema";

function toJsonContext(
  context?: PixelcareAiContext | null,
): Prisma.InputJsonValue | undefined {
  if (!context) return undefined;
  return context as Prisma.InputJsonValue;
}

function titleFromPrompt(prompt?: string): string | undefined {
  if (!prompt?.trim()) return undefined;
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  return cleaned.slice(0, PIXELCARE_AI_LIMITS.maxTitleChars);
}

export const conversationService = {
  list(tenantId: string, userId: string) {
    return conversationRepository.listForOwner(tenantId, userId);
  },

  async getOwned(tenantId: string, userId: string, id: string) {
    return conversationRepository.findOwned(tenantId, userId, id);
  },

  async assertOwned(tenantId: string, userId: string, id: string) {
    const row = await conversationRepository.findOwnedMeta(tenantId, userId, id);
    if (!row) {
      throw new Error("Conversation not found.");
    }
    return row;
  },

  async create(input: {
    tenantId: string;
    userId: string;
    title?: string;
    context?: PixelcareAiContext | null;
    starterPrompt?: string;
  }) {
    const conversation = await conversationRepository.create({
      tenantId: input.tenantId,
      userId: input.userId,
      title: input.title ?? titleFromPrompt(input.starterPrompt),
      contextJson: toJsonContext(input.context),
    });

    if (input.starterPrompt?.trim()) {
      await conversationRepository.createMessage({
        conversationId: conversation.id,
        role: "user",
        content: input.starterPrompt.trim(),
      });
      await conversationRepository.touch(conversation.id);
    }

    return conversation;
  },

  async patch(input: {
    tenantId: string;
    userId: string;
    id: string;
    title?: string;
    context?: PixelcareAiContext | null;
    pinned?: boolean;
  }) {
    await this.assertOwned(input.tenantId, input.userId, input.id);
    await conversationRepository.updateOwned(input.tenantId, input.userId, input.id, {
      title: input.title,
      contextJson:
        input.context === undefined
          ? undefined
          : input.context === null
            ? null
            : toJsonContext(input.context),
      pinnedAt:
        input.pinned === undefined
          ? undefined
          : input.pinned
            ? new Date()
            : null,
    });
    return conversationRepository.findOwned(input.tenantId, input.userId, input.id);
  },

  async softDelete(tenantId: string, userId: string, id: string) {
    await this.assertOwned(tenantId, userId, id);
    await conversationRepository.softDeleteOwned(tenantId, userId, id);
  },

  async appendUserMessage(input: {
    tenantId: string;
    userId: string;
    conversationId: string;
    content: string;
  }) {
    await this.assertOwned(input.tenantId, input.userId, input.conversationId);
    const message = await conversationRepository.createMessage({
      conversationId: input.conversationId,
      role: "user",
      content: input.content,
    });
    const meta = await conversationRepository.findOwnedMeta(
      input.tenantId,
      input.userId,
      input.conversationId,
    );
    if (meta?.title === "New conversation") {
      await conversationRepository.updateOwned(
        input.tenantId,
        input.userId,
        input.conversationId,
        { title: titleFromPrompt(input.content) },
      );
    }
    await conversationRepository.touch(input.conversationId);
    return message;
  },

  async appendAssistantMessage(input: {
    conversationId: string;
    content: string;
  }) {
    const message = await conversationRepository.createMessage({
      conversationId: input.conversationId,
      role: "assistant",
      content: input.content,
    });
    await conversationRepository.touch(input.conversationId);
    return message;
  },

  async recentModelMessages(conversationId: string) {
    const rows = await conversationRepository.listRecentMessages(conversationId);
    return rows
      .reverse()
      .filter((row) => row.role === "user" || row.role === "assistant")
      .map((row) => ({
        role: row.role as "user" | "assistant",
        content: row.content,
      }));
  },
};
