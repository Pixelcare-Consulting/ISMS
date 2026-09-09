"use server";

import { canUseAiAssist } from "@/features/ai/constants/ai-permissions";
import { isAiConfigured } from "@/features/ai/lib/provider";
import { askCopilotSchema } from "@/features/ai/schemas/ai.schema";
import {
  generateDashboardBriefing,
  getCachedDashboardBriefing,
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

export async function getAiStatusAction() {
  const session = await requireAuth();
  return {
    canAssist: canUseAiAssist(session.user.permissions),
    configured: isAiConfigured(),
  };
}

export async function askCopilotAction(input: unknown) {
  const gate = await requireAssist();
  if (!gate.ok || !gate.session) {
    return { ok: false as const, error: "You do not have access to ISMS Assist." };
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
  });

  if (!result.configured) {
    return { ok: false as const, error: result.message };
  }

  return { ok: true as const, answer: result.answer };
}

export async function getCachedDashboardBriefingAction() {
  const gate = await requireAssist();
  if (!gate.ok || !gate.session) {
    return { ok: false as const, briefing: null, configured: isAiConfigured() };
  }

  const briefing = await getCachedDashboardBriefing(gate.session);
  return { ok: true as const, briefing, configured: isAiConfigured() };
}

export async function generateDashboardBriefingAction(force = false) {
  const gate = await requireAssist();
  if (!gate.ok || !gate.session) {
    return { ok: false as const, error: "You do not have access to ISMS Assist." };
  }

  if (!isAiConfigured()) {
    return {
      ok: false as const,
      error:
        "Daily briefing is not connected yet. Ask your administrator to enable ISMS Assist.",
    };
  }

  const briefing = await generateDashboardBriefing(gate.session, { force });
  return { ok: true as const, briefing };
}
