import { aorService } from "@/features/aors/services/aor.service";
import { hasPermission } from "@/lib/auth/permissions";

/** Unrestricted SC scope for admins / master-data managers. */
export function isScUnrestricted(permissions: string[] | undefined) {
  return (
    hasPermission(permissions, "service_centers.manage") ||
    hasPermission(permissions, "master_data.manage") ||
    hasPermission(permissions, "aors.manage")
  );
}

export async function resolveScIdsForUser(
  tenantId: string,
  userId: string,
  permissions: string[] | undefined,
): Promise<string[] | null> {
  if (isScUnrestricted(permissions)) {
    return null;
  }
  return aorService.getServiceCenterIdsForUser(tenantId, userId);
}

export function assertScInScope(
  serviceCenterId: string,
  scopedIds: string[] | null,
) {
  if (scopedIds !== null && !scopedIds.includes(serviceCenterId)) {
    throw new Error("Service center is outside your area of responsibility");
  }
}
