"use server";

import { revalidatePath } from "next/cache";

import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { parseSapQueueView } from "@/features/sap/constants/sap-job-types";
import { SAP_MANAGE } from "@/features/sap/constants/sap-permissions";
import type {
  SapJobListSort,
  SapJobListSortDir,
} from "@/features/sap/repositories/sap-integration.repository";
import { sapService } from "@/features/sap/services/sap.service";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
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
  const session = await requirePermission(SAP_MANAGE);
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
  limit?: string | number;
  sort?: string;
  sortDir?: string;
  view?: string;
  q?: string;
}) {
  const session = await requirePermission(SAP_MANAGE);
  const q = input?.q?.trim();
  return sapService.listJobs(
    session.user.tenantId,
    {
      page: input?.page,
      limit: parseTablePageSize(input?.limit),
      view: parseSapQueueView(input?.view),
      q: q || undefined,
    },
    { field: parseSapJobSort(input?.sort), dir: parseSapJobSortDir(input?.sortDir) },
  );
}

export async function countSapJobsByStatusAction() {
  const session = await requirePermission(SAP_MANAGE);
  return sapService.countByStatus(session.user.tenantId);
}

/** Who sent this job, and who queued it when that is a different person. Tenant-scoped. */
export async function getSapJobPeopleAction(jobId: string) {
  const session = await requirePermission(SAP_MANAGE);
  return sapService.getJobPeople(session.user.tenantId, jobId);
}

/** SAP codes and document keys on the record this job posted. Tenant-scoped. */
export async function getSapJobSupportAction(jobId: string) {
  const session = await requirePermission(SAP_MANAGE);
  return sapService.getJobSupportFields(session.user.tenantId, jobId);
}

export async function processSapQueueAction() {
  const session = await requirePermission(SAP_MANAGE);
  const results = await sapService.processPendingJobs(
    session.user.tenantId,
    session.user.id,
  );
  revalidatePath("/settings/sap-integration");
  return { success: true as const, results };
}

export async function retrySapJobAction(jobId: string) {
  const session = await requirePermission(SAP_MANAGE);
  try {
    const result = await sapService.retryJob(session.user.tenantId, session.user.id, jobId);
    revalidatePath("/settings/sap-integration");
    return { success: true as const, result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to retry the SAP job" };
  }
}

