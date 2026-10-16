import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";

import {
  AI_ASSISTANT_BUSY_MESSAGE,
  AI_ASSISTANT_RATE_LIMIT_MESSAGE,
  AI_ASSISTANT_UNAVAILABLE_MESSAGE,
  messageForAssistantGate,
} from "@/features/ai/constants/assistant-limits";
import { logAiAction } from "@/features/ai/lib/audit";
import { readAiAssistantGate } from "@/features/ai/services/assistant-policy.service";
import { PIXELCARE_AI_LIMITS } from "@/features/pixelcare-ai/constants/limits";
import { isPixelcareAiSampleMode } from "@/features/pixelcare-ai/constants/permissions";
import { storedHistoryForModel } from "@/features/pixelcare-ai/lib/model-history";
import {
  getPixelcareAiLanguageModel,
  isPixelcareAiProviderConfigured,
  PROVIDER_NOT_CONFIGURED,
} from "@/features/pixelcare-ai/lib/provider";
import {
  extractSalesOrderNumbers,
  preparePixelcareOrderLookupStep,
} from "@/features/pixelcare-ai/lib/sales-order-numbers";
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
import { reserveAiRequest } from "@/lib/cache/ai-limits";
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

async function acceptedContext(
  session: AppSession,
  context?: PixelcareAiContext | null,
): Promise<PixelcareAiContext | null> {
  if (!context) return null;
  if (!context.branchId) return context;
  const access = await assertPermittedBranch(session, context.branchId);
  if (!access.ok) return { ...context, branchId: null };
  return { ...context, branchId: access.branch.id };
}

export async function streamPixelcareAiChat(input: {
  session: AppSession;
  conversationId?: string | null;
  messages?: UIMessage[];
  message?: string;
  context?: PixelcareAiContext | null;
  abortSignal?: AbortSignal;
}) {
  const policy = await readAiAssistantGate(input.session.user.tenantId);
  if (!policy.ok) {
    const denied = messageForAssistantGate(policy.reason);
    return { ok: false as const, status: denied.status, error: denied.error };
  }

  if (!isPixelcareAiProviderConfigured() && !isPixelcareAiSampleMode()) {
    return {
      ok: false as const,
      status: 503 as const,
      error: PROVIDER_NOT_CONFIGURED,
    };
  }

  const reservation = await reserveAiRequest({
    tenantId: input.session.user.tenantId,
    userId: input.session.user.id,
    limits: policy.limits,
  });
  if (!reservation.ok) {
    const error =
      reservation.reason === "rate"
        ? AI_ASSISTANT_RATE_LIMIT_MESSAGE
        : reservation.reason === "concurrency"
          ? AI_ASSISTANT_BUSY_MESSAGE
          : AI_ASSISTANT_UNAVAILABLE_MESSAGE;
    return {
      ok: false as const,
      status: reservation.reason === "unavailable" ? 503 : 429,
      error,
    };
  }

  try {
  const userText = extractLatestUserText(input.messages, input.message);
  if (!userText) {
    await reservation.release();
    return { ok: false as const, status: 400 as const, error: "Message is required." };
  }
  if (userText.length > PIXELCARE_AI_LIMITS.maxMessageChars) {
    await reservation.release();
    return {
      ok: false as const,
      status: 400 as const,
      error: `Message exceeds ${PIXELCARE_AI_LIMITS.maxMessageChars} characters.`,
    };
  }

  const safeContext = await acceptedContext(input.session, input.context);

  let conversationId = input.conversationId ?? null;
  if (conversationId) {
    await conversationService.assertOwned(
      input.session.user.tenantId,
      input.session.user.id,
      conversationId,
    );
    if (safeContext !== undefined && input.context !== undefined) {
      await conversationService.patch({
        tenantId: input.session.user.tenantId,
        userId: input.session.user.id,
        id: conversationId,
        context: safeContext,
      });
    }
  } else {
    const created = await conversationService.create({
      tenantId: input.session.user.tenantId,
      userId: input.session.user.id,
      context: safeContext,
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

  const history = await conversationService.recentModelMessages(
    conversationId,
    policy.limits.maxContextMessages,
  );
  const messagesForModel = storedHistoryForModel({
    rows: history,
    maxContextMessages: policy.limits.maxContextMessages,
    pageContext: safeContext,
  });

  const salesOrderNumbers = extractSalesOrderNumbers(userText);
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
      : (safeContext ?? null);
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
    await reservation.release();
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

  const policyAbort = new AbortController();
  const timeoutSignal = AbortSignal.timeout(policy.limits.requestTimeoutMs);
  const abortSignal = input.abortSignal
    ? AbortSignal.any([input.abortSignal, timeoutSignal, policyAbort.signal])
    : AbortSignal.any([timeoutSignal, policyAbort.signal]);

  const result = streamText({
    model: getPixelcareAiLanguageModel(),
    system: buildPixelcareAiSystemPrompt({
      sampleMode,
      context: workingContext,
      activeBranch,
      userName: input.session.user.name,
      salesOrderNumbers,
    }),
    messages: messagesForModel,
    tools: buildPixelcareAiTools(input.session, {
      defaultBranchId: activeBranch?.id ?? workingContext?.branchId ?? null,
      messageOrderNumbers: salesOrderNumbers,
      maxToolSteps: policy.limits.maxToolSteps,
      requestTimeoutMs: policy.limits.requestTimeoutMs,
      abortSignal,
    }),
    prepareStep: async ({ stepNumber }) => {
      const stillOn = await readAiAssistantGate(input.session.user.tenantId);
      if (!stillOn.ok) {
        policyAbort.abort();
        return { toolChoice: "none" as const, activeTools: [] as const };
      }
      return preparePixelcareOrderLookupStep({ stepNumber, salesOrderNumbers });
    },
    stopWhen: stepCountIs(policy.limits.maxToolSteps),
    maxOutputTokens: policy.limits.maxOutputTokens,
    abortSignal,
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
      try {
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
            toolCount: listPixelcareAiToolNames().length,
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
        await logAiAction({
          tenantId: input.session.user.tenantId,
          userId: input.session.user.id,
          action: "ai.pixelcare.chat",
          metadata: {
            conversationId,
            decision: "allow",
            totalTokens: usage?.totalTokens ?? null,
          },
        });
      } finally {
        await reservation.release();
      }
    },
    onError: () => {
      logger.error({ requestId, event: "pixelcare-ai.chat.failed" }, "pixelcare-ai.chat.failed");
      void reservation.release();
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
  } catch (error) {
    await reservation.release();
    logger.error({ event: "pixelcare-ai.chat.failed" }, "pixelcare-ai.chat.failed");
    throw error;
  }
}
