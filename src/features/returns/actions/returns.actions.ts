"use server";

import {
  RETURNS_VIEW,
} from "@/features/returns/constants/returns-permissions";
import { returnsKpiService } from "@/features/returns/services/returns-kpi.service";
import {
  SC_RETURN_COMPLETE,
  SC_RETURN_EVALUATE,
  SC_RETURN_REQUEST,
  SC_RETURN_APPROVE,
} from "@/features/service-center-ops/constants/sc-permissions";
import { resolveScIdsForUser } from "@/features/service-center-ops/services/sc-scope";
import { SALES_RETURN_VIEW } from "@/features/sales/constants/sales-permissions";
import { requireAnyPermission } from "@/lib/auth/permissions";

export async function getReturnsKpisAction() {
  const session = await requireAnyPermission([
    RETURNS_VIEW,
    SALES_RETURN_VIEW,
    SC_RETURN_REQUEST,
    SC_RETURN_EVALUATE,
    SC_RETURN_APPROVE,
    SC_RETURN_COMPLETE,
    "service_centers.return.request",
    "service_centers.return.evaluate",
    "service_centers.return.approve",
    "service_centers.return.complete",
  ]);

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
