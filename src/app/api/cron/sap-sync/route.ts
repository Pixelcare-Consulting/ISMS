import { NextResponse } from "next/server";

import { SAP_SYNC_ENTITIES } from "@/features/sap/constants/sap-sync-entities";
import { runSapSync } from "@/features/sap/services/sap-sync-engine";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/shared/logger";

/**
 * Keeps every SAP master-data sync running without anyone clicking anything.
 *
 * Each invocation walks the registry once per tenant. The small entities finish a whole
 * pass in seconds; `SerialNumberDetails` is far too large for one request, so it takes
 * whatever budget is left and resumes here next time. Over successive runs that means the
 * first backfill completes on its own, and afterwards the same job is the routine
 * incremental sync — SAP changes master data all day and ISMS should not learn about it
 * only when someone remembers to press a button.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Leaves room under `maxDuration` for the last page's writes and the audit record. */
const RUN_BUDGET_MS = 240_000;

/**
 * Smallest slice worth starting. Below this an entity is skipped to next invocation
 * rather than opening a page it has no time to write.
 */
const MIN_SLICE_MS = 5_000;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Vercel Cron sends the project's CRON_SECRET as a bearer token. Without one configured
  // the route stays closed rather than silently running for anyone who finds the URL.
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

  const deadline = Date.now() + RUN_BUDGET_MS;
  const results: Record<string, unknown>[] = [];

  for (const config of configs) {
    for (const entity of SAP_SYNC_ENTITIES) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_SLICE_MS) break;

      try {
        const result = await runSapSync(
          config.tenantId,
          entity,
          // No acting user: the audit row records this as a scheduled run, not a person.
          null,
          { budgetMs: remaining },
        );
        results.push({
          tenantId: config.tenantId,
          entity: entity.entity,
          fetched: result.fetched,
          created: result.created,
          updated: result.updated,
          unchanged: result.unchanged,
          caughtUp: result.caughtUp,
          passRows: result.passRows,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        logger.error(
          { tenantId: config.tenantId, entity: entity.entity, err: message },
          "sap sync cron slice failed",
        );
        // One entity failing (or one tenant's SAP being unreachable) must not stop the
        // rest: the cursor keeps its place, so the next run picks this up where it fell
        // over while the other entities carry on now.
        results.push({ tenantId: config.tenantId, entity: entity.entity, error: message });
      }
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), slices: results });
}
