import { z } from "zod";

export const copilotMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

export const askCopilotSchema = z.object({
  messages: z.array(copilotMessageSchema).min(1).max(12),
});

export const copilotAnswerSchema = z.object({
  answer: z.string().min(1),
  sources: z
    .array(
      z.object({
        title: z.string().min(1),
        href: z.string().optional(),
      }),
    )
    .max(8),
});

export const dashboardBriefingSchema = z.object({
  sentences: z.array(z.string().min(1)).min(2).max(3),
  sources: z
    .array(
      z.object({
        title: z.string().min(1),
        href: z.string().min(1),
      }),
    )
    .max(6),
});

export type CopilotChatMessage = z.infer<typeof copilotMessageSchema>;
export type CopilotAnswer = z.infer<typeof copilotAnswerSchema>;
export type DashboardBriefing = z.infer<typeof dashboardBriefingSchema>;
