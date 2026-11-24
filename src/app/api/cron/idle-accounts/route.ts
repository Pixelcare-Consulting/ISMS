import { NextResponse } from "next/server";

import { runIdleAccountMaintenance } from "@/features/users/services/idle-account.service";
import { logger } from "@/lib/shared/logger";

/**
 * Idle-account tick, called on a schedule by the `cron` container
 * (docker-compose.yml) together with the other `/api/cron/*` routes.
 *
 * Deletes sessions with no activity for 30 minutes, then disables accounts
 * with no activity for 7 days. Super Admin is never disabled.
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
    const outcome = await runIdleAccountMaintenance(new Date());
    return NextResponse.json({ ranAt: new Date().toISOString(), ...outcome });
  } catch {
    logger.error({ event: "idle.accounts.cron.failed" }, "idle accounts cron failed");
    return NextResponse.json({ error: "The idle account run could not finish." }, { status: 500 });
  }
}
