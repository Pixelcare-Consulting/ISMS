import { prisma } from "@/lib/database/client";
import {
  evaluateLiveSession,
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
  return evaluateLiveSession({
    row: {
      expiresAt: row.expiresAt,
      lastActiveAt: row.lastActiveAt ?? new Date(0),
    },
    now,
  });
}

/**
 * Refresh last activity only when the session is still live.
 * An idle or missing row is left unchanged so the sign-out stands.
 */
export async function touchSessionActivity(
  sessionId: string,
  userId: string,
  now = new Date(),
): Promise<LiveSessionState> {
  const state = await readLiveSessionState(sessionId, userId, now);
  if (state !== "ok") {
    return state;
  }
  await prisma.$transaction([
    prisma.session.update({
      where: { id: sessionId },
      data: { lastActiveAt: now },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: now },
    }),
  ]);
  return "ok";
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
 * Remove every session whose last click, key, or scroll is older than 5 minutes.
 * Pass a user id to clear only that account. A closed browser then cannot block the next sign-in.
 */
export async function deleteIdleSessions(
  now = new Date(),
  userId?: string,
): Promise<number> {
  const cutoff = new Date(now.getTime() - SESSION_IDLE_MS);
  const result = await prisma.session.deleteMany({
    where: {
      lastActiveAt: { lt: cutoff },
      ...(userId ? { userId } : {}),
    },
  });
  return result.count;
}
