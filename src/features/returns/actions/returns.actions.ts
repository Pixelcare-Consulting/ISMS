"use server";

import { RETURNS_ACCESS_PERMISSIONS } from "@/features/returns/constants/returns-permissions";
import { returnsKpiService } from "@/features/returns/services/returns-kpi.service";
import { resolveScIdsForUser } from "@/features/service-center-ops/services/sc-scope";
import { requireAnyPermission } from "@/lib/auth/permissions";

export async function getReturnsKpisAction() {
  const session = await requireAnyPermission([...RETURNS_ACCESS_PERMISSIONS]);

  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );

  return returnsKpiService.getAllTabsKpis(
    session.user.tenantId,
    scopedIds,
  );
}
