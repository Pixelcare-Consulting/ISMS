"use server";

import { revalidatePath } from "next/cache";

import { saveAutomationSettings, runOwnerAutomation } from "@/features/pixelcare-ai/automations/automation.service";
import { confirmReplenishmentProposal } from "@/features/pixelcare-ai/automations/replenishment";
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
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
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

export async function confirmProposalAction(proposalId: string) {
  const access = await requirePixelcareSession();
  if (!access.ok) return access;
  try {
    const result = await confirmReplenishmentProposal({
      tenantId: access.session.user.tenantId,
      actorUserId: access.session.user.id,
      proposalId,
    });
    revalidatePath("/internal/ai/automations");
    revalidatePath("/orders/auto-replenish");
    return { ok: true as const, result };
  } catch (error) {
    return failure(error);
  }
}
