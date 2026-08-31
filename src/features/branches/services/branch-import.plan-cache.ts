/**
 * Branch-import binding of the shared import plan cache.
 *
 * The cache itself lives in `@/lib/shared/import-plan-cache` so every chunked
 * importer shares one store (and one place to swap for Redis in step 2 — see
 * `docs/branches-import-optimization.md`). This file only pins the namespace.
 */

import {
  getCachedPlan,
  invalidatePlan,
  invalidatePlansForTenant as invalidateNamespacedPlansForTenant,
  planKeyFor as namespacedPlanKeyFor,
  setCachedPlan,
} from "@/lib/shared/import-plan-cache";

const NAMESPACE = "branch-import";

/** Stable key for an uploaded file. Doubles as the opaque handle the client echoes. */
export function planKeyFor(tenantId: string, file: Buffer): string {
  return namespacedPlanKeyFor(NAMESPACE, tenantId, file);
}

/** Tenant-scoped clear — used when a plan is known to be stale (e.g. after a write). */
export function invalidatePlansForTenant(tenantId: string): void {
  invalidateNamespacedPlansForTenant(NAMESPACE, tenantId);
}

export { getCachedPlan, setCachedPlan, invalidatePlan };
