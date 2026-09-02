"use server";

import { revalidatePath } from "next/cache";

import { tenantIdSchema } from "@/features/provider/schemas/provider.schema";
import { sapServiceLayerSchema } from "@/features/sap/schemas/sap-service-layer.schema";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { requirePlatformOperator } from "@/lib/auth/permissions";

/**
 * SAP Service Layer *credential* configuration — platform operators only.
 *
 * These deliberately do not live in `sap.actions.ts`: that module is guarded by
 * the `sap.manage` permission, which is granted to tenant Admin and Logistics
 * roles. Pointing a tenant at a different SAP host, or disabling SSL
 * verification, is infrastructure config rather than tenant administration, so
 * it is gated on `requirePlatformOperator()` (provider role on the platform
 * tenant) instead — a tenant super_admin cannot reach it.
 *
 * Because a platform operator's own `session.user.tenantId` is the *platform*
 * tenant, every action here takes the target tenant explicitly, matching the
 * rest of the provider console. The session supplies only the actor id, so the
 * audit trail lands in the customer's log attributed to the operator.
 */

function resolveTenantId(tenantId: string) {
  const parsed = tenantIdSchema.safeParse({ tenantId });
  return parsed.success ? parsed.data.tenantId : null;
}

function revalidateTenant(tenantId: string) {
  revalidatePath(`/provider/tenants/${tenantId}`);
}

export async function listProviderSapSettingsAction(tenantId: string) {
  await requirePlatformOperator();
  const target = resolveTenantId(tenantId);
  if (!target) return [];
  return sapServiceLayerService.listSettings(target);
}

export async function saveProviderSapSettingsAction(
  tenantId: string,
  input: unknown,
) {
  const session = await requirePlatformOperator();
  const target = resolveTenantId(tenantId);
  if (!target) return { error: "Tenant is required" };

  const parsed = sapServiceLayerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const settings = await sapServiceLayerService.saveSettings(
      target,
      session.user.id,
      parsed.data,
    );
    revalidateTenant(target);
    return { success: true as const, settings };
  } catch (e) {
    return {
      error:
        e instanceof Error ? e.message : "Failed to save Service Layer settings",
    };
  }
}

export async function updateProviderSapSettingsAction(
  tenantId: string,
  input: unknown & { configId?: string },
) {
  const session = await requirePlatformOperator();
  const target = resolveTenantId(tenantId);
  if (!target) return { error: "Tenant is required" };
  if (!input?.configId?.trim()) return { error: "Configuration id is required" };

  const parsed = sapServiceLayerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const settings = await sapServiceLayerService.updateSettings(
      target,
      session.user.id,
      input.configId,
      parsed.data,
    );
    revalidateTenant(target);
    return { success: true as const, settings };
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? e.message
          : "Failed to update Service Layer settings",
    };
  }
}

export async function deleteProviderSapSettingsAction(
  tenantId: string,
  input: { configId: string },
) {
  const session = await requirePlatformOperator();
  const target = resolveTenantId(tenantId);
  if (!target) return { error: "Tenant is required" };
  if (!input.configId?.trim()) return { error: "Configuration id is required" };

  try {
    await sapServiceLayerService.deleteSettings(
      target,
      session.user.id,
      input.configId,
    );
    revalidateTenant(target);
    return { success: true as const };
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? e.message
          : "Failed to delete Service Layer settings",
    };
  }
}

export async function testProviderSapConnectionAction(input: unknown) {
  await requirePlatformOperator();
  const parsed = sapServiceLayerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    return await sapServiceLayerService.testConnection(parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Connection test failed" };
  }
}

export async function getProviderSapSessionStatusAction(tenantId: string) {
  await requirePlatformOperator();
  const target = resolveTenantId(tenantId);
  if (!target) return { error: "Tenant is required" };

  try {
    const status = await sapServiceLayerService.getSessionStatus(target);
    return { success: true as const, status };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to read session status",
    };
  }
}

export async function establishProviderSapSessionAction(
  tenantId: string,
  input: { configId: string },
) {
  await requirePlatformOperator();
  const target = resolveTenantId(tenantId);
  if (!target) return { error: "Tenant is required" };
  if (!input.configId?.trim()) return { error: "Configuration id is required" };

  try {
    const status = await sapServiceLayerService.establishSession(
      target,
      input.configId,
    );
    return { success: true as const, status };
  } catch (e) {
    return {
      error:
        e instanceof Error ? e.message : "Failed to establish SAP session",
    };
  }
}

export async function logoutProviderSapSessionAction(
  tenantId: string,
  input: { configId: string },
) {
  await requirePlatformOperator();
  const target = resolveTenantId(tenantId);
  if (!target) return { error: "Tenant is required" };
  if (!input.configId?.trim()) return { error: "Configuration id is required" };

  try {
    const status = await sapServiceLayerService.logoutSession(
      target,
      input.configId,
    );
    return { success: true as const, status };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to logout SAP session",
    };
  }
}

export async function setProviderSapStatusAction(
  tenantId: string,
  input: { configId: string; isEnabled: boolean },
) {
  const session = await requirePlatformOperator();
  const target = resolveTenantId(tenantId);
  if (!target) return { error: "Tenant is required" };
  if (!input.configId?.trim()) return { error: "Configuration id is required" };

  try {
    await sapServiceLayerService.setActiveStatus(
      target,
      session.user.id,
      input.configId,
      input.isEnabled,
    );
    revalidateTenant(target);
    return { success: true as const };
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? e.message
          : "Failed to update configuration status",
    };
  }
}
