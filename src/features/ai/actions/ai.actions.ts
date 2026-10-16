"use server";

import { canUseAiAssist } from "@/features/ai/constants/ai-permissions";
import {
  AI_ASSISTANT_FAILED_MESSAGE,
  messageForAssistantGate,
} from "@/features/ai/constants/assistant-limits";
import { isAiConfigured } from "@/features/ai/lib/provider";
import { askCopilotSchema } from "@/features/ai/schemas/ai.schema";
import { publicAssistantError } from "@/features/ai/lib/assistant-messages";
import { readAiAssistantGate } from "@/features/ai/services/assistant-policy.service";
import {
  generateDashboardBriefing,
  getCachedDashboardBriefing,
  type DashboardBriefingSurface,
} from "@/features/ai/services/briefing.service";
import { answerCopilotQuestion } from "@/features/ai/services/copilot.service";
import { requireAuth } from "@/lib/auth/permissions";

async function requireAssist() {
  const session = await requireAuth();
  if (!canUseAiAssist(session.user.permissions)) {
    return { ok: false as const, session: null };
  }
  return { ok: true as const, session };
}

function normalizeSurface(
  surface?: DashboardBriefingSurface,
): DashboardBriefingSurface {
  return surface === "sales" ? "sales" : "operations";
}

export async function getAiStatusAction() {
  const session = await requireAuth();
  const policy = await readAiAssistantGate(session.user.tenantId);
  return {
    canAssist: canUseAiAssist(session.user.permissions),
    configured: isAiConfigured() && policy.ok,
    enabled: policy.ok,
  };
}

async function requireEnabledAssist() {
  const gate = await requireAssist();
  if (!gate.ok || !gate.session) {
    return { ok: false as const, session: null, error: "You do not have access to ISMS Assist." };
  }
  const policy = await readAiAssistantGate(gate.session.user.tenantId);
  if (!policy.ok) {
    return { ok: false as const, session: null, error: messageForAssistantGate(policy.reason).error };
  }
  return { ok: true as const, session: gate.session, error: null, limits: policy.limits };
}

export async function askCopilotAction(input: unknown) {
  const gate = await requireEnabledAssist();
  if (!gate.ok || !gate.session) {
    return { ok: false as const, error: gate.error ?? "You do not have access to ISMS Assist." };
  }

  if (!isAiConfigured()) {
    return {
      ok: false as const,
      error:
        "ISMS Assist is not connected yet. Ask your administrator to enable it, or browse Help & Support.",
    };
  }

  const parsed = askCopilotSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Ask a short question to continue." };
  }

  const result = await answerCopilotQuestion({
    session: gate.session,
    messages: parsed.data.messages,
    limits: gate.limits,
  });

  if (!result.configured) {
    return { ok: false as const, error: result.message };
  }

  return { ok: true as const, answer: result.answer };
}

export async function getCachedDashboardBriefingAction(
  surface?: DashboardBriefingSurface,
) {
  const gate = await requireAssist();
  if (!gate.ok || !gate.session) {
    return { ok: false as const, briefing: null, configured: false };
  }
  const policy = await readAiAssistantGate(gate.session.user.tenantId);
  if (!policy.ok) {
    return { ok: true as const, briefing: null, configured: false };
  }

  const briefing = await getCachedDashboardBriefing(
    gate.session,
    normalizeSurface(surface),
  );
  return { ok: true as const, briefing, configured: isAiConfigured() };
}

export async function generateDashboardBriefingAction(
  force = false,
  surface?: DashboardBriefingSurface,
) {
  const gate = await requireEnabledAssist();
  if (!gate.ok || !gate.session) {
    return {
      ok: false as const,
      error: gate.error ?? "You do not have access to ISMS Assist.",
    };
  }

  if (!isAiConfigured()) {
    return {
      ok: false as const,
      error:
        "Daily briefing is not connected yet. Ask your administrator to enable ISMS Assist.",
    };
  }

  try {
    const briefing = await generateDashboardBriefing(gate.session, {
      force,
      surface: normalizeSurface(surface),
      limits: gate.limits,
    });
    return { ok: true as const, briefing };
  } catch (error) {
    return {
      ok: false as const,
      error: publicAssistantError(error, AI_ASSISTANT_FAILED_MESSAGE),
    };
  }
}
