import { NextResponse } from "next/server";

import { runSapCopyToFollow } from "@/features/logistics/services/sap-copy-to-follow.service";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/shared/logger";

/**
 * The SAP Copy To follow-up, called on a schedule by the `cron` container
 * (docker-compose*.yml), right after `sap-check`.
 *
 * Unlike `sap-check` this one writes: it applies the ITs / DRs SAP users made with Copy
 * To from an approved order's ITR / SO, so their serials become DIT at the branch. It only
 * follows documents ISMS itself created; master-data syncs stay manual. See
 * `sap-copy-to-follow.service.ts` and docs/sap-copy-to-follow-plan.md.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Per-tenant time budget, so several tenants still fit inside one request. */
const TENANT_BUDGET_MS = 60_000;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Without a secret configured the route stays closed rather than running for anyone
  // who finds the URL.
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configs = await prisma.sapServiceLayerConfig.findMany({
    where: { isEnabled: true },
    select: { tenantId: true },
    distinct: ["tenantId"],
  });

  const tenants: Record<string, unknown>[] = [];
  for (const config of configs) {
    try {
      const result = await runSapCopyToFollow(config.tenantId, { budgetMs: TENANT_BUDGET_MS });
      tenants.push({ tenantId: config.tenantId, ...result });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      // One tenant's SAP being unreachable must not stop the others.
      logger.error({ tenantId: config.tenantId, err: message }, "sap copy-to follow failed");
      tenants.push({ tenantId: config.tenantId, error: message });
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), tenants });
}
