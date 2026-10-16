import { z } from "zod";

import { PIXELCARE_AI_LIMITS } from "@/features/pixelcare-ai/constants/limits";
import { pixelcareAiContextSchema } from "@/features/pixelcare-ai/schemas/context.schema";

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(PIXELCARE_AI_LIMITS.maxTitleChars).optional(),
  context: pixelcareAiContextSchema.optional().nullable(),
  starterPrompt: z.string().trim().max(PIXELCARE_AI_LIMITS.maxMessageChars).optional(),
});

export const patchConversationSchema = z.object({
  title: z.string().trim().min(1).max(PIXELCARE_AI_LIMITS.maxTitleChars).optional(),
  context: pixelcareAiContextSchema.optional().nullable(),
  /** true = pin (sets pinnedAt now); false = unpin */
  pinned: z.boolean().optional(),
});

export const chatRequestSchema = z.object({
  conversationId: z.string().cuid().optional().nullable(),
  messages: z
    .array(
      z.object({
        id: z.string().optional(),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(z.unknown()).optional(),
        content: z.string().optional(),
      }),
    )
    .optional(),
  message: z.string().trim().max(PIXELCARE_AI_LIMITS.maxMessageChars).optional(),
  context: pixelcareAiContextSchema.optional().nullable(),
  id: z.string().optional(),
});
