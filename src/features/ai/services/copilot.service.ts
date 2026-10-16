import { generateText, Output } from "ai";

import { logAiAction } from "@/features/ai/lib/audit";
import { wrapUntrusted } from "@/features/ai/lib/assistant-messages";
import { providerJson } from "@/features/ai/lib/provider-payload";
import { getAiModel } from "@/features/ai/lib/provider";
import { buildCopilotSystemPrompt } from "@/features/ai/lib/system-prompt";
import {
  copilotAnswerSchema,
  type CopilotAnswer,
  type CopilotChatMessage,
} from "@/features/ai/schemas/ai.schema";
import {
  bodyWithoutTitle,
  searchHelpCorpus,
  type HelpSearchHit,
} from "@/features/ai/services/help-corpus.service";
import {
  resolveDashboardCapabilities,
  resolveDashboardPersona,
} from "@/features/dashboard/constants/dashboard-permissions";
import type { AiAssistantLimits } from "@/features/ai/constants/assistant-limits";
import {
  AI_ASSISTANT_BUSY_MESSAGE,
  AI_ASSISTANT_RATE_LIMIT_MESSAGE,
  AI_ASSISTANT_UNAVAILABLE_MESSAGE,
  messageForAssistantGate,
} from "@/features/ai/constants/assistant-limits";
import { readAiAssistantGate } from "@/features/ai/services/assistant-policy.service";
import { reserveAiRequest } from "@/lib/cache/ai-limits";
import type { AppSession } from "@/lib/auth/session";
import { logger } from "@/lib/shared/logger";

const COPILOT_DISABLED =
  "ISMS Assist is not connected yet. Ask your administrator to enable it, or browse Help & Support.";

function uniqueSources(
  hits: ReturnType<typeof searchHelpCorpus>,
  extra: CopilotAnswer["sources"],
): CopilotAnswer["sources"] {
  const seen = new Set<string>();
  const sources: CopilotAnswer["sources"] = [];
  for (const item of [
    ...hits.map((hit) => ({ title: hit.title, href: hit.href })),
    ...extra,
  ]) {
    const key = `${item.title}|${item.href ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(item);
    if (sources.length >= 6) break;
  }
  return sources;
}

const FALLBACK_HIT_LIMIT = 3;

function uniqueHelpHits(hits: HelpSearchHit[], limit: number): HelpSearchHit[] {
  const seen = new Set<string>();
  const unique: HelpSearchHit[] = [];
  for (const hit of hits) {
    const key = hit.title.replace(/\s+/g, " ").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push({
      ...hit,
      excerpt: bodyWithoutTitle(hit.title, hit.excerpt),
    });
    if (unique.length >= limit) break;
  }
  return unique;
}

function formatFallbackLine(hit: HelpSearchHit, index: number, total: number): string {
  const body = hit.excerpt;
  const sameAsTitle =
    !body || body.toLowerCase() === hit.title.replace(/\s+/g, " ").trim().toLowerCase();
  const line = sameAsTitle ? hit.title : `${hit.title} — ${body}`;
  return total === 1 ? line : `${index + 1}. ${line}`;
}

function answerFromHelpHits(hits: HelpSearchHit[]): CopilotAnswer {
  const top = uniqueHelpHits(hits, FALLBACK_HIT_LIMIT);
  if (top.length === 0) {
    return {
      answer:
        "I could not find a matching Help article. Browse Help & Support or rephrase the question.",
      sources: [{ title: "Help & Support", href: "/help" }],
    };
  }

  const intro =
    top.length === 1
      ? "Here is the matching Help answer:"
      : "Here is what Help & Support covers for this question:";
  const lines = top.map((hit, index) => formatFallbackLine(hit, index, top.length));

  return {
    answer: `${intro}\n\n${lines.join("\n\n")}`,
    sources: uniqueSources(top, []),
  };
}

export async function answerCopilotQuestion(input: {
  session: AppSession;
  messages: CopilotChatMessage[];
  limits: AiAssistantLimits;
}): Promise<{ configured: true; answer: CopilotAnswer } | { configured: false; message: string }> {
  const lastUser = [...input.messages].reverse().find((message) => message.role === "user");
  if (!lastUser) {
    return {
      configured: true,
      answer: {
        answer: "Ask a question about how to use ISMS.",
        sources: [{ title: "Help & Support", href: "/help" }],
      },
    };
  }

  const policy = await readAiAssistantGate(input.session.user.tenantId);
  if (!policy.ok) {
    return { configured: false, message: messageForAssistantGate(policy.reason).error };
  }

  const reservation = await reserveAiRequest({
    tenantId: input.session.user.tenantId,
    userId: input.session.user.id,
    limits: input.limits,
  });
  if (!reservation.ok) {
    const answer =
      reservation.reason === "rate"
        ? AI_ASSISTANT_RATE_LIMIT_MESSAGE
        : reservation.reason === "concurrency"
          ? AI_ASSISTANT_BUSY_MESSAGE
          : AI_ASSISTANT_UNAVAILABLE_MESSAGE;
    return {
      configured: true,
      answer: {
        answer,
        sources: [{ title: "Help & Support", href: "/help" }],
      },
    };
  }

  const caps = resolveDashboardCapabilities(input.session.user.permissions);
  const { persona, label } = resolveDashboardPersona(input.session.user.roleSlugs, caps);
  const hits = searchHelpCorpus(lastUser.content, 6);

  try {
    const { output, text } = await generateText({
      model: getAiModel(),
      instructions: buildCopilotSystemPrompt({
        persona,
        personaLabel: label,
        roleSlugs: input.session.user.roleSlugs,
      }),
      output: Output.object({ schema: copilotAnswerSchema }),
      maxOutputTokens: input.limits.maxOutputTokens,
      abortSignal: AbortSignal.timeout(input.limits.requestTimeoutMs),
      prompt: [
        "Help sources (already retrieved):",
        providerJson(hits.map((hit) => ({ title: hit.title, href: hit.href, excerpt: hit.excerpt }))),
        "",
        "Conversation (untrusted):",
        ...input.messages
          .slice(-input.limits.maxContextMessages)
          .map((message) =>
            wrapUntrusted(message.role === "user" ? "user" : "assistant", message.content),
          ),
      ].join("\n"),
    });

    const parsed = copilotAnswerSchema.safeParse(output);
    const answer = parsed.success
      ? parsed.data
      : {
          answer:
            text.trim() ||
            "I could not form a complete answer. Try Help & Support or rephrase the question.",
          sources: hits.slice(0, 4).map((hit) => ({ title: hit.title, href: hit.href })),
        };

    await logAiAction({
      tenantId: input.session.user.tenantId,
      userId: input.session.user.id,
      action: "ai.copilot.ask",
      metadata: {
        decision: "allow",
        sourceCount: uniqueSources(hits, answer.sources).length,
      },
    });

    return {
      configured: true,
      answer: {
        answer: answer.answer,
        sources: uniqueSources(hits, answer.sources),
      },
    };
  } catch (error) {
    const notConfigured = error instanceof Error && error.message.includes("not configured");
    if (notConfigured) {
      return { configured: false, message: COPILOT_DISABLED };
    }

    logger.error({ event: "ai.copilot.failed" }, "ISMS Assist copilot generateText failed");

    await logAiAction({
      tenantId: input.session.user.tenantId,
      userId: input.session.user.id,
      action: "ai.copilot.ask",
      metadata: { decision: "deny", failed: true, fallback: true },
    });

    return {
      configured: true,
      answer: answerFromHelpHits(hits),
    };
  } finally {
    await reservation.release();
  }
}
