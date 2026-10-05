import { NextResponse } from "next/server";

import { purgeClosedSapChangeNotifications } from "@/features/sap/services/sap-change-notifier";
import { runSapChangeCheck } from "@/features/sap/services/sap-change-check";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/shared/logger";

/**
 * The SAP auto-check, called on a schedule by the `cron` container (docker-compose.yml).
 *
 * Asks SAP, read-only, whether anything a Sync would bring into ISMS has changed, and
 * notifies the users who can press that Sync. It never syncs: SAP → ISMS syncs stay
 * manual so users see and control what enters ISMS. See `sap-change-check.ts`.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  // Tenants with no enabled Service Layer config are skipped — there is nothing to read.
  const configs = await prisma.sapServiceLayerConfig.findMany({
    where: { isEnabled: true },
    select: { tenantId: true },
    distinct: ["tenantId"],
  });

  const tenants: Record<string, unknown>[] = [];
  for (const config of configs) {
    try {
      const checks = await runSapChangeCheck(config.tenantId);
      tenants.push({ tenantId: config.tenantId, checks });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      // One tenant's SAP being unreachable must not stop the others.
      logger.error({ tenantId: config.tenantId, err: message }, "sap change check failed");
      tenants.push({ tenantId: config.tenantId, error: message });
    }
  }

  let purged = 0;
  try {
    purged = await purgeClosedSapChangeNotifications();
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : e }, "sap change purge failed");
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), tenants, purged });
}
