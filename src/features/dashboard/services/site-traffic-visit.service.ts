import {
  nextPathVisit,
  normalizeSitePath,
} from "@/features/dashboard/lib/site-traffic-path";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/shared/logger";

/**
 * Remember the page that was opened. The same address does not move the time
 * or the page count, so a refresh stays on the clock the person already has.
 */
export async function recordSiteVisit(input: {
  sessionId: string;
  tenantId: string;
  path: string;
  now?: Date;
}): Promise<void> {
  const path = normalizeSitePath(input.path);
  if (!path || !input.sessionId || !input.tenantId) return;

  const now = input.now ?? new Date();
  const current = await prisma.session.findFirst({
    where: { id: input.sessionId },
    select: { lastPath: true, lastPathAt: true },
  });
  if (!current) return;

  const next = nextPathVisit({
    previousPath: current.lastPath,
    previousAt: current.lastPathAt,
    path,
    now,
  });
  if (!next.changed) return;

  await prisma.$transaction([
    prisma.session.update({
      where: { id: input.sessionId },
      data: { lastPath: next.path, lastPathAt: next.at },
    }),
    prisma.sitePageHit.upsert({
      where: { tenantId_path: { tenantId: input.tenantId, path: next.path } },
      create: {
        tenantId: input.tenantId,
        path: next.path,
        hitCount: 1,
        lastHitAt: next.at,
      },
      update: {
        hitCount: { increment: 1 },
        lastHitAt: next.at,
      },
    }),
  ]);
}

/** Page visits are a display signal. A failed write must not take down the screen. */
export async function recordSiteVisitSafe(input: {
  sessionId: string;
  tenantId: string;
  path: string;
}): Promise<void> {
  try {
    await recordSiteVisit(input);
  } catch (error) {
    logger.warn({ err: error }, "site-traffic: visit was not recorded");
  }
}
