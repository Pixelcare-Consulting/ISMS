"use server";

import { revalidatePath } from "next/cache";

import { AI_ASSISTANT_FAILED_MESSAGE } from "@/features/ai/constants/assistant-limits";
import {
  aiAssistantPolicyInputSchema,
  readAiAssistantPolicyForm,
  saveAiAssistantPolicy,
  type AiAssistantPolicyInput,
} from "@/features/ai/services/assistant-policy.service";
import { tenantIdSchema } from "@/features/provider/schemas/provider.schema";
import {
  providerService,
  type ProviderTenantDetail,
} from "@/features/provider/services/provider.service";
import { requirePlatformOperator } from "@/lib/auth/permissions";

/**
 * Per-company assistant switch for the provider console.
 * Company settings no longer show this control. A tenant admin cannot reach
 * these actions: they require a platform operator, and the target is the
 * customer tenant id, not the caller's own tenant.
 */

function resolveTenantId(tenantId: string) {
  const parsed = tenantIdSchema.safeParse({ tenantId });
  return parsed.success ? parsed.data.tenantId : null;
}

async function requireCustomerTenant(
  tenantId: string,
): Promise<{ error: string } | { tenant: ProviderTenantDetail }> {
  const target = resolveTenantId(tenantId);
  if (!target) return { error: "Tenant is required" as const };
  const tenant = await providerService.getCustomerDetail(target);
  if (!tenant) return { error: "Customer organization not found" as const };
  return { tenant };
}

export async function getProviderAiAssistantPolicyAction(
  tenantId: string,
): Promise<AiAssistantPolicyInput | null> {
  await requirePlatformOperator();
  const resolved = await requireCustomerTenant(tenantId);
  if ("error" in resolved) return null;
  return readAiAssistantPolicyForm(resolved.tenant.id);
}

export async function updateProviderAiAssistantPolicyAction(
  tenantId: string,
  input: unknown,
): Promise<{ success: true } | { error: string }> {
  await requirePlatformOperator();
  const resolved = await requireCustomerTenant(tenantId);
  if ("error" in resolved) return { error: resolved.error };
  if (resolved.tenant.status === "disabled") {
    return {
      error: "Organization is disabled. Restore it before making changes.",
    };
  }

  const parsed = aiAssistantPolicyInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the assistant limits and try again." };
  }

  try {
    await saveAiAssistantPolicy(resolved.tenant.id, parsed.data);
    revalidatePath(`/provider/tenants/${resolved.tenant.id}`);
    revalidatePath("/internal/ai");
    revalidatePath("/help");
    revalidatePath("/dashboard/operations");
    revalidatePath("/dashboard/sales");
    return { success: true };
  } catch {
    return { error: AI_ASSISTANT_FAILED_MESSAGE };
  }
}
