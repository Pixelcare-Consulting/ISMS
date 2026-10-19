import { NextResponse } from "next/server";

import { runDueAiAutomations } from "@/features/pixelcare-ai/automations/run-scheduled";
import { logger } from "@/lib/shared/logger";

/**
 * Pixelcare automation tick, called on a schedule by the `cron` container
 * (docker-compose.yml) together with `/api/cron/sap-check`.
 *
 * Runs enabled automations whose local time of day has been reached. Overlapping
 * ticks share an idempotency key and do not double-run. A template with no
 * executor is recorded as a failed run.
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

  try {
    const outcomes = await runDueAiAutomations(new Date());
    return NextResponse.json({ ranAt: new Date().toISOString(), outcomes });
  } catch {
    logger.error({ event: "ai.automations.cron.failed" }, "ai automations cron failed");
    return NextResponse.json({ error: "The automation run could not finish." }, { status: 500 });
  }
}
