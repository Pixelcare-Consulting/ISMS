"use server";

import { revalidatePath, updateTag } from "next/cache";

import { AI_ASSISTANT_FAILED_MESSAGE } from "@/features/ai/constants/assistant-limits";
import {
  aiAssistantPolicyInputSchema,
  saveAiAssistantPolicy,
} from "@/features/ai/services/assistant-policy.service";
import { companySettingsSchema } from "@/features/settings/schemas/company-settings.schema";
import { tenantService } from "@/features/tenants/services/tenant.service";
import { requireCompanyManage } from "@/lib/auth/permissions";

export async function updateCompanySettingsAction(input: {
  name: string;
  tagline: string;
  logo?: string | null;
}) {
  const session = await requireCompanyManage();
  const parsed = companySettingsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    await tenantService.updateBranding(
      session.user.tenantId,
      session.user.id,
      parsed.data,
    );
    revalidatePath("/", "layout");
    revalidatePath("/settings/company");
    updateTag(`tenant-branding-${session.user.tenantId}`);
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to update company settings",
    };
  }
}

export async function updateAiAssistantPolicyAction(input: unknown) {
  const session = await requireCompanyManage();
  const parsed = aiAssistantPolicyInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the assistant limits and try again." };
  }

  try {
    await saveAiAssistantPolicy(session.user.tenantId, parsed.data);
    revalidatePath("/settings/company");
    revalidatePath("/internal/ai");
    revalidatePath("/help");
    revalidatePath("/dashboard/operations");
    revalidatePath("/dashboard/sales");
    return { success: true as const };
  } catch {
    return { error: AI_ASSISTANT_FAILED_MESSAGE };
  }
}
