import { prisma } from "@/lib/database/client";
import {
  evaluateLiveSession,
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
  await prisma.session.update({
    where: { id: sessionId },
    data: { lastActiveAt: now },
  });
  return "ok";
}
