import { prisma } from "@/lib/database/client";
import {
  resolveLiveSessionOnRequest,
  SESSION_IDLE_MS,
  type LiveSessionState,
} from "@/lib/auth/session-policy";

export async function readLiveSessionState(
  sessionId: string,
  userId: string,
  now = new Date(),
): Promise<LiveSessionState> {
  if (!sessionId) {
    return "missing";
  }
  const row = await prisma.session.findFirst({
    where: { id: sessionId, userId },
    select: { expiresAt: true, lastActiveAt: true },
  });
  if (!row) {
    return "missing";
  }
  return resolveLiveSessionOnRequest({
    row: {
      expiresAt: row.expiresAt,
      lastActiveAt: row.lastActiveAt ?? new Date(0),
    },
    now,
    activity: "none",
  }).state;
}

/**
 * A page open, server action, or activity ping the person started.
 * The stamp moves to `now` before the idle check, so this request is not
 * judged on the previous ping. A missing or expired row is left unchanged.
 */
export async function admitActiveSession(
  sessionId: string,
  userId: string,
  now = new Date(),
): Promise<LiveSessionState> {
  if (!sessionId) {
    return "missing";
  }
  const row = await prisma.session.findFirst({
    where: { id: sessionId, userId },
    select: { expiresAt: true, lastActiveAt: true },
  });
  const decision = resolveLiveSessionOnRequest({
    row: row
      ? {
          expiresAt: row.expiresAt,
          lastActiveAt: row.lastActiveAt ?? new Date(0),
        }
      : null,
    now,
    activity: "active",
  });
  if (decision.state !== "ok" || decision.lastActiveAt === null) {
    return decision.state;
  }
  await prisma.$transaction([
    prisma.session.update({
      where: { id: sessionId },
      data: { lastActiveAt: decision.lastActiveAt },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: decision.lastActiveAt },
    }),
  ]);
  return "ok";
}

/** Record a click, key, or scroll. Same rule as a page the person opened. */
export async function touchSessionActivity(
  sessionId: string,
  userId: string,
  now = new Date(),
): Promise<LiveSessionState> {
  return admitActiveSession(sessionId, userId, now);
}

/** True when the account is turned off and is not deleted. */
export async function isAccountDisabled(userId: string): Promise<boolean> {
  const account = await prisma.user.findFirst({
    where: { id: userId },
    select: { disabledAt: true, deletedAt: true },
  });
  return Boolean(account && !account.deletedAt && account.disabledAt);
}

/**
 * Remove sessions with no activity for 5 minutes.
 * Pass a user id to clear only that account. A closed browser then cannot block the next sign-in.
 * Pass `exceptSessionId` for the request in hand so that row is not deleted before its activity stamp is saved.
 */
export async function deleteIdleSessions(
  now = new Date(),
  userId?: string,
  exceptSessionId?: string,
): Promise<number> {
  const cutoff = new Date(now.getTime() - SESSION_IDLE_MS);
  const keepId = exceptSessionId?.trim() ?? "";
  const result = await prisma.session.deleteMany({
    where: {
      lastActiveAt: { lt: cutoff },
      ...(userId ? { userId } : {}),
      ...(keepId.length > 0 ? { id: { not: keepId } } : {}),
    },
  });
  return result.count;
}
