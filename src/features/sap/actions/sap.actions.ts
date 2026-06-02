"use server";

import { revalidatePath } from "next/cache";

import { sapServiceLayerSchema } from "@/features/sap/schemas/sap-service-layer.schema";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { sapService } from "@/features/sap/services/sap.service";
import { requirePermission } from "@/lib/auth/permissions";

export async function listSapServiceLayerSettingsAction() {
  const session = await requirePermission("logistics.manage");
  return sapServiceLayerService.listSettings(session.user.tenantId);
}

export async function saveSapServiceLayerSettingsAction(input: unknown) {
  const session = await requirePermission("logistics.manage");
  const parsed = sapServiceLayerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const settings = await sapServiceLayerService.saveSettings(
      session.user.tenantId,
      session.user.id,
      parsed.data,
    );
    revalidatePath("/settings/sap-integration/service-layer");
    return { success: true as const, settings };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save Service Layer settings" };
  }
}

export async function updateSapServiceLayerSettingsAction(input: unknown & { configId?: string }) {
  const session = await requirePermission("logistics.manage");
  if (!input?.configId?.trim()) return { error: "Configuration id is required" };

  const parsed = sapServiceLayerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const settings = await sapServiceLayerService.updateSettings(
      session.user.tenantId,
      session.user.id,
      input.configId,
      parsed.data,
    );
    revalidatePath("/settings/sap-integration/service-layer");
    return { success: true as const, settings };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update Service Layer settings" };
  }
}

export async function deleteSapServiceLayerSettingsAction(input: { configId: string }) {
  const session = await requirePermission("logistics.manage");
  if (!input.configId?.trim()) return { error: "Configuration id is required" };

  try {
    await sapServiceLayerService.deleteSettings(session.user.tenantId, session.user.id, input.configId);
    revalidatePath("/settings/sap-integration/service-layer");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete Service Layer settings" };
  }
}

export async function testSapServiceLayerConnectionAction(input: unknown) {
  await requirePermission("logistics.manage");
  const parsed = sapServiceLayerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const result = await sapServiceLayerService.testConnection(parsed.data);
    return result;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Connection test failed" };
  }
}

export async function setSapServiceLayerStatusAction(input: {
  configId: string;
  isEnabled: boolean;
}) {
  const session = await requirePermission("logistics.manage");

  if (!input.configId?.trim()) return { error: "Configuration id is required" };

  try {
    await sapServiceLayerService.setActiveStatus(
      session.user.tenantId,
      session.user.id,
      input.configId,
      input.isEnabled,
    );
    revalidatePath("/settings/sap-integration/service-layer");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update configuration status" };
  }
}

export async function listSapJobsAction(input?: { page?: number }) {
  const session = await requirePermission("logistics.manage");
  return sapService.listJobs(session.user.tenantId, { page: input?.page });
}

export async function processSapQueueAction() {
  const session = await requirePermission("logistics.manage");
  const results = await sapService.processPendingJobs(
    session.user.tenantId,
    session.user.id,
  );
  revalidatePath("/settings/sap-integration");
  return { success: true as const, results };
}

export async function syncInventoryFromSapAction(input?: { warehouseCode?: string }) {
  const session = await requirePermission("logistics.manage");
  await sapService.syncInventoryFromSap(session.user.tenantId, {
    warehouseCode: input?.warehouseCode,
  });
  revalidatePath("/settings/sap-integration");
  return { success: true as const };
}
