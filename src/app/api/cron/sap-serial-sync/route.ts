import { NextResponse } from "next/server";

import { serialNumberSapSyncService } from "@/features/serial-numbers/services/serial-number-sap-sync.service";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/shared/logger";

/**
 * Drives the serial sync without anyone clicking anything.
 *
 * `SerialNumberDetails` is far too large to read in one request, so each invocation is a
 * bounded slice that resumes from the tenant's watermark. Scheduling it means the first
 * backfill finishes on its own over successive runs, and once caught up the same job
 * becomes the routine incremental sync — SAP adds serials all day and ISMS should not
 * learn about them only when someone remembers to press a button.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Leaves room under `maxDuration` for the final page's writes and the audit record. */
const SLICE_BUDGET_MS = 240_000;

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

  // One slice per tenant per invocation. Tenants with no enabled Service Layer config are
  // skipped — there is nothing to read for them.
  const configs = await prisma.sapServiceLayerConfig.findMany({
    where: { isEnabled: true },
    select: { tenantId: true },
    distinct: ["tenantId"],
  });

  const results: Record<string, unknown>[] = [];

  for (const config of configs) {
    try {
      const result = await serialNumberSapSyncService.syncFromSap(
        config.tenantId,
        // No acting user: the audit row records this as a scheduled run, not a person.
        null,
        { budgetMs: SLICE_BUDGET_MS },
      );
      results.push({
        tenantId: config.tenantId,
        fetched: result.fetched,
        created: result.created,
        updated: result.updated,
        cursor: result.cursor,
        caughtUp: result.caughtUp,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      logger.error({ tenantId: config.tenantId, err: message }, "sap serial cron slice failed");
      // One tenant's SAP being unreachable must not stop the others.
      results.push({ tenantId: config.tenantId, error: message });
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), tenants: results });
}
