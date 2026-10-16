"use server";

import { revalidatePath } from "next/cache";

import { AI_ASSISTANT_FAILED_MESSAGE } from "@/features/ai/constants/assistant-limits";
import { AssistantUserError, publicAssistantError } from "@/features/ai/lib/assistant-messages";
import { AutomationAccessError } from "@/features/pixelcare-ai/automations/owner-access";
import { saveAutomationSettings, runOwnerAutomation } from "@/features/pixelcare-ai/automations/automation.service";
import {
  confirmReplenishmentWithToken,
  issueReplenishmentConfirmation,
} from "@/features/pixelcare-ai/automations/confirmation";
import { resolvePixelcareAiPageAccess } from "@/features/pixelcare-ai/lib/access";
import type { AppSession } from "@/lib/auth/session";

async function requirePixelcareSession(): Promise<
  { ok: true; session: AppSession } | { ok: false; error: string }
> {
  const access = await resolvePixelcareAiPageAccess();
  if (!access.ok) {
    return { ok: false, error: "Pixelcare access is not allowed for this account." };
  }
  return { ok: true, session: access.session };
}

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof AutomationAccessError || error instanceof AssistantUserError) {
    return { ok: false, error: publicAssistantError(error, error.message) };
  }
  return { ok: false, error: AI_ASSISTANT_FAILED_MESSAGE };
}

export async function saveAutomationAction(input: {
  automationId: string;
  enabled: boolean;
  timezone: string;
  timeOfDayMinutes: number;
  weekdays: number[];
  branchIds: string[];
  recipientUserIds: string[];
  thresholds: Record<string, unknown>;
}) {
  const access = await requirePixelcareSession();
  if (!access.ok) return access;
  try {
    await saveAutomationSettings(access.session, input);
    revalidatePath("/internal/ai/automations");
    return { ok: true as const };
  } catch (error) {
    return failure(error);
  }
}

export async function runAutomationAction(input: {
  automationId: string;
  trigger: "manual" | "preview";
}) {
  const access = await requirePixelcareSession();
  if (!access.ok) return access;
  try {
    const run = await runOwnerAutomation(access.session, input.automationId, input.trigger);
    revalidatePath("/internal/ai/automations");
    return { ok: true as const, run };
  } catch (error) {
    return failure(error);
  }
}

export async function issueReplenishmentConfirmationAction(proposalId: string) {
  const access = await requirePixelcareSession();
  if (!access.ok) return access;
  try {
    const issued = await issueReplenishmentConfirmation({
      tenantId: access.session.user.tenantId,
      userId: access.session.user.id,
      proposalId,
    });
    return { ok: true as const, token: issued.token };
  } catch (error) {
    return failure(error);
  }
}

export async function confirmProposalAction(input: {
  proposalId: string;
  confirmationToken: string;
}) {
  const access = await requirePixelcareSession();
  if (!access.ok) return access;
  if (!input.confirmationToken.trim()) {
    return { ok: false as const, error: "Confirm this proposal from the Confirm order button." };
  }
  try {
    const result = await confirmReplenishmentWithToken({
      tenantId: access.session.user.tenantId,
      actorUserId: access.session.user.id,
      proposalId: input.proposalId,
      confirmationToken: input.confirmationToken,
    });
    revalidatePath("/internal/ai/automations");
    revalidatePath("/orders/auto-replenish");
    return { ok: true as const, result };
  } catch (error) {
    return failure(error);
  }
}
