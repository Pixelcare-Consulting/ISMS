"use server";

import { revalidatePath } from "next/cache";

import { sapSyncStatusRepository } from "@/features/sap/repositories/sap-sync-status.repository";
import type { SapMasterSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { sapServiceLayerSchema } from "@/features/sap/schemas/sap-service-layer.schema";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { sapService } from "@/features/sap/services/sap.service";
import { requireAuth, requirePermission } from "@/lib/auth/permissions";

/** A "running" row older than this is almost certainly from a killed/restarted server,
 *  not an actual in-progress sync — self-heal it instead of blocking the button forever. */
const STALE_SYNC_MS = 10 * 60 * 1000;

export async function listSapServiceLayerSettingsAction() {
  const session = await requirePermission("sap.manage");
  return sapServiceLayerService.listSettings(session.user.tenantId);
}

export async function saveSapServiceLayerSettingsAction(input: unknown) {
  const session = await requirePermission("sap.manage");
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
  const session = await requirePermission("sap.manage");
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
  const session = await requirePermission("sap.manage");
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
  await requirePermission("sap.manage");
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

export async function getSapSessionStatusAction() {
  const session = await requirePermission("sap.manage");
  try {
    const status = await sapServiceLayerService.getSessionStatus(session.user.tenantId);
    return { success: true as const, status };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to read session status" };
  }
}

export async function establishSapSessionAction(input: { configId: string }) {
  const session = await requirePermission("sap.manage");
  if (!input.configId?.trim()) return { error: "Configuration id is required" };

  try {
    const status = await sapServiceLayerService.establishSession(
      session.user.tenantId,
      input.configId,
    );
    return { success: true as const, status };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to establish SAP session" };
  }
}

export async function logoutSapSessionAction(input: { configId: string }) {
  const session = await requirePermission("sap.manage");
  if (!input.configId?.trim()) return { error: "Configuration id is required" };

  try {
    const status = await sapServiceLayerService.logoutSession(
      session.user.tenantId,
      input.configId,
    );
    return { success: true as const, status };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to logout SAP session" };
  }
}

export async function setSapServiceLayerStatusAction(input: {
  configId: string;
  isEnabled: boolean;
}) {
  const session = await requirePermission("sap.manage");

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
  const session = await requirePermission("sap.manage");
  return sapService.listJobs(session.user.tenantId, { page: input?.page });
}

export async function processSapQueueAction() {
  const session = await requirePermission("sap.manage");
  const results = await sapService.processPendingJobs(
    session.user.tenantId,
    session.user.id,
  );
  revalidatePath("/settings/sap-integration");
  return { success: true as const, results };
}

/**
 * Read-only status check for the given SAP pull-sync keys (e.g. `["branch", "warehouse"]`).
 * Used by `SapSyncButton` on mount so a freshly loaded page can show "still syncing"
 * instead of assuming idle when a sync is running in another tab or survived a refresh.
 */
export async function getSapSyncStatusesAction(entities: string[]) {
  const session = await requireAuth();
  const rows = await sapSyncStatusRepository.listByTenant(session.user.tenantId, entities);

  const statuses = await Promise.all(
    rows.map(async (row) => {
      const isStaleRunning =
        row.status === "running" && Date.now() - row.startedAt.getTime() > STALE_SYNC_MS;
      if (!isStaleRunning) {
        return {
          entity: row.entity,
          status: row.status,
          result: row.result as SapMasterSyncResult | null,
          error: row.error,
        };
      }

      const error = "Sync did not finish — the server may have restarted mid-run.";
      await sapSyncStatusRepository.markError(session.user.tenantId, row.entity, error);
      return { entity: row.entity, status: "error" as const, result: null, error };
    }),
  );

  return { success: true as const, statuses };
}

export async function syncInventoryFromSapAction(input?: { warehouseCode?: string }) {
  const session = await requirePermission("sap.manage");
  await sapService.syncInventoryFromSap(session.user.tenantId, {
    warehouseCode: input?.warehouseCode,
  });
  revalidatePath("/settings/sap-integration");
  return { success: true as const };
}
