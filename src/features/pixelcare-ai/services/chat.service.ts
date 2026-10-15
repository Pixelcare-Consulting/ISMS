import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type ModelMessage,
  type UIMessage,
} from "ai";

import { PIXELCARE_AI_LIMITS } from "@/features/pixelcare-ai/constants/limits";
import { isPixelcareAiSampleMode } from "@/features/pixelcare-ai/constants/permissions";
import {
  getPixelcareAiLanguageModel,
  isPixelcareAiProviderConfigured,
  PROVIDER_NOT_CONFIGURED,
} from "@/features/pixelcare-ai/lib/provider";
import { buildPixelcareAiSystemPrompt } from "@/features/pixelcare-ai/lib/system-prompt";
import {
  extractBranchIdFromToolResult,
  parseConversationContext,
} from "@/features/pixelcare-ai/lib/tool-context-branch";
import type { PixelcareAiContext } from "@/features/pixelcare-ai/schemas/context.schema";
import { listPixelcareAiToolNames } from "@/features/pixelcare-ai/constants/tools-list";
import { conversationService } from "@/features/pixelcare-ai/services/conversation.service";
import { assertPermittedBranch } from "@/features/pixelcare-ai/tools/branch-access";
import { buildPixelcareAiTools } from "@/features/pixelcare-ai/tools/registry";
import { rateLimit } from "@/lib/cache/redis";
import type { AppSession } from "@/lib/auth/session";
import { logger } from "@/lib/shared/logger";

async function resolveActiveBranch(
  session: AppSession,
  context?: PixelcareAiContext | null,
) {
  const branchId = context?.branchId;
  if (!branchId) return null;
  const access = await assertPermittedBranch(session, branchId);
  if (!access.ok) return null;
  return access.branch;
}

function extractLatestUserText(messages: UIMessage[] | undefined, fallback?: string): string {
  if (fallback?.trim()) return fallback.trim();
  if (!messages?.length) return "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    const parts = message.parts ?? [];
    const text = parts
      .filter((part): part is { type: "text"; text: string } => {
        return (
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          (part as { type: string }).type === "text" &&
          "text" in part
        );
      })
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (text) return text;
    const content = (message as { content?: string }).content;
    if (typeof content === "string" && content.trim()) return content.trim();
  }
  return "";
}

export async function streamPixelcareAiChat(input: {
  session: AppSession;
  conversationId?: string | null;
  messages?: UIMessage[];
  message?: string;
  context?: PixelcareAiContext | null;
  abortSignal?: AbortSignal;
}) {
  if (!isPixelcareAiProviderConfigured() && !isPixelcareAiSampleMode()) {
    return {
      ok: false as const,
      status: 503 as const,
      error: PROVIDER_NOT_CONFIGURED,
    };
  }

  const limit = await rateLimit(
    `pixelcare-ai:${input.session.user.tenantId}:${input.session.user.id}`,
    PIXELCARE_AI_LIMITS.rateLimitMax,
    PIXELCARE_AI_LIMITS.rateLimitWindowSec,
  );
  if (!limit.allowed) {
    return {
      ok: false as const,
      status: 429 as const,
      error: "Too many Pixelcare AI requests. Wait a minute, then try again.",
    };
  }

  const userText = extractLatestUserText(input.messages, input.message);
  if (!userText) {
    return { ok: false as const, status: 400 as const, error: "Message is required." };
  }
  if (userText.length > PIXELCARE_AI_LIMITS.maxMessageChars) {
    return {
      ok: false as const,
      status: 400 as const,
      error: `Message exceeds ${PIXELCARE_AI_LIMITS.maxMessageChars} characters.`,
    };
  }

  let conversationId = input.conversationId ?? null;
  if (conversationId) {
    await conversationService.assertOwned(
      input.session.user.tenantId,
      input.session.user.id,
      conversationId,
    );
    if (input.context !== undefined) {
      await conversationService.patch({
        tenantId: input.session.user.tenantId,
        userId: input.session.user.id,
        id: conversationId,
        context: input.context,
      });
    }
  } else {
    const created = await conversationService.create({
      tenantId: input.session.user.tenantId,
      userId: input.session.user.id,
      context: input.context,
      title: userText.slice(0, 80),
    });
    conversationId = created.id;
  }

  await conversationService.appendUserMessage({
    tenantId: input.session.user.tenantId,
    userId: input.session.user.id,
    conversationId,
    content: userText,
  });

  const history = await conversationService.recentModelMessages(conversationId);
  const modelMessages: ModelMessage[] = history.map((row) => ({
    role: row.role,
    content: row.content,
  }));

  // Prefer UI message conversion when the client sent a full thread.
  let messagesForModel = modelMessages;
  if (input.messages && input.messages.length > 0) {
    try {
      messagesForModel = await convertToModelMessages(input.messages);
    } catch {
      messagesForModel = modelMessages;
    }
  }

  const sampleMode = isPixelcareAiSampleMode();
  const requestId = crypto.randomUUID();
  const started = Date.now();
  let workingContext: PixelcareAiContext | null =
    input.context === undefined
      ? parseConversationContext(
          (
            await conversationService.getOwned(
              input.session.user.tenantId,
              input.session.user.id,
              conversationId,
            )
          )?.contextJson,
        )
      : (input.context ?? null);
  const activeBranch = await resolveActiveBranch(input.session, workingContext);

  async function syncContextFromToolResults(
    toolResults: Array<{ toolName: string; output: unknown }>,
  ) {
    for (const result of toolResults) {
      const candidateId = extractBranchIdFromToolResult(result.toolName, result.output);
      if (!candidateId) continue;
      if (workingContext?.branchId === candidateId) continue;

      const access = await assertPermittedBranch(input.session, candidateId);
      if (!access.ok) continue;

      const nextContext: PixelcareAiContext = {
        ...(workingContext ?? {}),
        branchId: access.branch.id,
      };
      await conversationService.patch({
        tenantId: input.session.user.tenantId,
        userId: input.session.user.id,
        id: conversationId!,
        context: nextContext,
      });
      workingContext = nextContext;
      logger.info(
        {
          requestId,
          conversationId,
          branchId: access.branch.id,
          toolName: result.toolName,
        },
        "pixelcare-ai.context.branch-synced",
      );
    }
  }

  const responseHeaders = {
    "x-pixelcare-conversation-id": conversationId,
    "x-pixelcare-request-id": requestId,
  };

  if (!isPixelcareAiProviderConfigured() && sampleMode) {
    const sampleReply =
      "**Sample mode:** AI provider is not configured. This is a labeled sample reply — not live ISMS data.\n\nAsk about stock, shelf gaps, orders, or returns once Qwen credentials are set, or keep exploring with sample tools only.";
    await conversationService.appendAssistantMessage({
      conversationId,
      content: sampleReply,
    });
    const textId = "sample-text";
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "text-start", id: textId });
        writer.write({ type: "text-delta", id: textId, delta: sampleReply });
        writer.write({ type: "text-end", id: textId });
      },
    });
    return {
      ok: true as const,
      conversationId,
      requestId,
      response: createUIMessageStreamResponse({
        stream,
        headers: responseHeaders,
      }),
    };
  }

  const result = streamText({
    model: getPixelcareAiLanguageModel(),
    system: buildPixelcareAiSystemPrompt({
      sampleMode,
      context: workingContext,
      activeBranch,
      userName: input.session.user.name,
    }),
    messages: messagesForModel,
    tools: buildPixelcareAiTools(input.session, {
      defaultBranchId: activeBranch?.id ?? workingContext?.branchId ?? null,
    }),
    stopWhen: stepCountIs(PIXELCARE_AI_LIMITS.maxToolSteps),
    maxOutputTokens: PIXELCARE_AI_LIMITS.maxOutputTokens,
    abortSignal: input.abortSignal,
    providerOptions: {
      qwen: {
        enable_thinking: false,
      },
      openai: {
        // Model Studio OpenAI-compatible path; ignore if unsupported.
        enable_thinking: false,
      },
    },
    onStepFinish: async ({ toolResults }) => {
      if (!toolResults?.length) return;
      await syncContextFromToolResults(
        toolResults.map((result) => ({
          toolName: result.toolName,
          output: result.output,
        })),
      );
    },
    onFinish: async ({ text, usage, finishReason, steps }) => {
      // Final pass in case step callbacks raced or tools finished only on the last step.
      const lateResults = steps.flatMap((step) =>
        (step.toolResults ?? []).map((result) => ({
          toolName: result.toolName,
          output: result.output,
        })),
      );
      if (lateResults.length > 0) {
        await syncContextFromToolResults(lateResults);
      }

      const content = text.trim() || "I could not complete that answer. Try again or rephrase.";
      await conversationService.appendAssistantMessage({
        conversationId: conversationId!,
        content,
      });
      logger.info(
        {
          requestId,
          toolNames: listPixelcareAiToolNames(),
          finishReason,
          latencyMs: Date.now() - started,
          totalTokens: usage?.totalTokens ?? null,
          conversationId,
          tenantId: input.session.user.tenantId,
          userId: input.session.user.id,
          contextBranchId: workingContext?.branchId ?? null,
        },
        "pixelcare-ai.chat.finish",
      );
    },
  });

  return {
    ok: true as const,
    conversationId,
    requestId,
    response: result.toUIMessageStreamResponse({
      headers: responseHeaders,
    }),
  };
}
