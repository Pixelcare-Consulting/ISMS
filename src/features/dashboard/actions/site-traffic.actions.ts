"use server";

import { requireAnyPermission } from "@/lib/auth/permissions";
import { siteTrafficService } from "@/features/dashboard/services/site-traffic.service";

const SITE_TRAFFIC_ACCESS = ["users.manage", "audit_logs.view"] as const;

export async function getSiteTrafficOverviewAction() {
  const session = await requireAnyPermission([...SITE_TRAFFIC_ACCESS]);
  return siteTrafficService.getOverview(session.user.tenantId);
}
