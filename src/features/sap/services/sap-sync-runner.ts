import { sapSyncStatusRepository } from "@/features/sap/repositories/sap-sync-status.repository";
import type { SapMasterSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { withSapSyncLock } from "@/features/sap/services/sap-sync-lock";

/**
 * Shared entry point for every SAP → ISMS master-data pull-sync (branches, warehouses,
 * and whatever module adopts this next). Combines:
 *  - `withSapSyncLock`: dedupes concurrent calls in this process (second tab, stale page).
 *  - `SapSyncStatus`: persists run status so a freshly loaded page — even after a server
 *    restart — can tell "still syncing" apart from "idle", instead of assuming idle.
 *
 * `entity` must match the `syncKey` the module's `SapSyncButton` uses (e.g. `"branch"`).
 */
export function runTrackedSapSync(
  tenantId: string,
  entity: string,
  actorUserId: string,
  run: () => Promise<SapMasterSyncResult>,
): Promise<SapMasterSyncResult> {
  return withSapSyncLock(`${entity}:${tenantId}`, async () => {
    await sapSyncStatusRepository.markRunning(tenantId, entity, actorUserId);
    try {
      const result = await run();
      await sapSyncStatusRepository.markSuccess(tenantId, entity, result);
      return result;
    } catch (e) {
      await sapSyncStatusRepository.markError(
        tenantId,
        entity,
        e instanceof Error ? e.message : "Unknown error",
      );
      throw e;
    }
  });
}
