import { generateText, Output } from "ai";

import { logAiAction } from "@/features/ai/lib/audit";
import { getAiModel } from "@/features/ai/lib/provider";
import { buildCopilotSystemPrompt } from "@/features/ai/lib/system-prompt";
import {
  copilotAnswerSchema,
  type CopilotAnswer,
  type CopilotChatMessage,
} from "@/features/ai/schemas/ai.schema";
import {
  bodyWithoutTitle,
  formatHelpHitsForPrompt,
  searchHelpCorpus,
  type HelpSearchHit,
} from "@/features/ai/services/help-corpus.service";
import {
  resolveDashboardCapabilities,
  resolveDashboardPersona,
} from "@/features/dashboard/constants/dashboard-permissions";
import { rateLimit } from "@/lib/cache/redis";
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Assist is unavailable";
}

export async function answerCopilotQuestion(input: {
  session: AppSession;
  messages: CopilotChatMessage[];
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

  const limit = await rateLimit(
    `ai-copilot:${input.session.user.tenantId}:${input.session.user.id}`,
    20,
    600,
  );
  if (!limit.allowed) {
    return {
      configured: true,
      answer: {
        answer:
          "You have asked quite a few questions just now. Wait a minute, then try again, or browse Help & Support.",
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
      prompt: [
        "Help sources (already retrieved):",
        formatHelpHitsForPrompt(hits),
        "",
        "Conversation:",
        ...input.messages.map(
          (message) => `${message.role === "user" ? "User" : "Assist"}: ${message.content}`,
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
        questionChars: lastUser.content.length,
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
    const message = errorMessage(error);
    if (message.includes("not configured")) {
      return { configured: false, message: COPILOT_DISABLED };
    }

    logger.error({ message }, "ISMS Assist copilot generateText failed");

    await logAiAction({
      tenantId: input.session.user.tenantId,
      userId: input.session.user.id,
      action: "ai.copilot.ask",
      metadata: { questionChars: lastUser.content.length, failed: true, fallback: true },
    });

    const fallback = answerFromHelpHits(hits);
    return {
      configured: true,
      answer: fallback,
    };
  }
}
