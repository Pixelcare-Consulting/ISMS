"use server";

import { revalidatePath } from "next/cache";

import { sapService } from "@/features/sap/services/sap.service";
import type {
  SapJobListSort,
  SapJobListSortDir,
} from "@/features/sap/repositories/sap-integration.repository";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * Tenant-facing SAP actions, guarded by the `sap.manage` permission.
 *
 * Service Layer *credential* configuration deliberately does not live here — it
 * is platform-operator only and lives in
 * `@/features/provider/actions/provider-sap.actions`. Adding a credential
 * action to this module would expose it to tenant Admin and Logistics roles.
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
