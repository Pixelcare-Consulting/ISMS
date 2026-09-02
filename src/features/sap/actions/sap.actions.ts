"use server";

import { revalidatePath } from "next/cache";

import { sapService } from "@/features/sap/services/sap.service";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import type {
  SapJobListSort,
  SapJobListSortDir,
} from "@/features/sap/repositories/sap-integration.repository";
import { requirePermission } from "@/lib/auth/permissions";
import { logger } from "@/lib/shared/logger";

/**
 * Tenant-facing SAP actions, guarded by the `sap.manage` permission.
 *
 * Service Layer *credential* configuration deliberately does not live here — it
 * is platform-operator only and lives in
 * `@/features/provider/actions/provider-sap.actions`. Adding a credential
 * action to this module would expose it to tenant Admin and Logistics roles.
 *
 * `getSapConnectionStateAction` is the one permitted touch of the Service Layer
 * service: it reads connection *state* only, and returns neither the config id
 * nor the company database name. Keep it that way.
 */

const SAP_JOB_SORT_FIELDS = new Set<SapJobListSort>([
  "jobType",
  "status",
  "referenceId",
  "sapDocNum",
  "attempts",
  "createdAt",
]);

function parseSapJobSort(value?: string): SapJobListSort | undefined {
  if (value && SAP_JOB_SORT_FIELDS.has(value as SapJobListSort)) {
    return value as SapJobListSort;
  }
  return undefined;
}

function parseSapJobSortDir(value?: string): SapJobListSortDir | undefined {
  if (value === "asc" || value === "desc") return value;
  return undefined;
}

/**
 * Read-only connection state for the tenant's queue page.
 *
 * Deliberately narrower than the operator's `getProviderSapSessionStatusAction`:
 * it returns the state and expiry only. `configId` and `companyDb` are withheld
 * — the company database name is stored encrypted and is credential-adjacent,
 * so it stays on the provider side. There is no connect/disconnect here either;
 * tenants observe the connection, they do not drive it.
 */
export async function getSapConnectionStateAction(): Promise<{
  state: "no_config" | "idle" | "connected";
  expiresAt?: number;
}> {
  const session = await requirePermission("sap.manage");
  try {
    const status = await sapServiceLayerService.getSessionStatus(
      session.user.tenantId,
    );
    return status.state === "connected"
      ? { state: "connected", expiresAt: status.expiresAt }
      : { state: status.state };
  } catch (e) {
    // A status read must never break the queue page — but log it, so a real
    // fault (e.g. a bad SAP_ENCRYPTION_KEY) is not silently shown as
    // "not configured".
    logger.error(
      { err: e, tenantId: session.user.tenantId },
      "Failed to read SAP connection state",
    );
    return { state: "no_config" };
  }
}

export async function listSapJobsAction(input?: {
  page?: number;
  sort?: string;
  sortDir?: string;
}) {
  const session = await requirePermission("sap.manage");
  return sapService.listJobs(
    session.user.tenantId,
    { page: input?.page },
    { field: parseSapJobSort(input?.sort), dir: parseSapJobSortDir(input?.sortDir) },
  );
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

export async function syncInventoryFromSapAction(input?: { warehouseCode?: string }) {
  const session = await requirePermission("sap.manage");
  await sapService.syncInventoryFromSap(session.user.tenantId, {
    warehouseCode: input?.warehouseCode,
  });
  revalidatePath("/settings/sap-integration");
  return { success: true as const };
}
