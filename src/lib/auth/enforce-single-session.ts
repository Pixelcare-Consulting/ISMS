import { APIError } from "better-auth/api";

import { prisma } from "@/lib/database/client";
import { deleteIdleSessions } from "@/lib/auth/session-liveness";
import {
  ALREADY_SIGNED_IN_MESSAGE,
  decideSessionCreate,
} from "@/lib/auth/session-policy";

function requestHeaders(context: unknown): Headers | null {
  if (!context || typeof context !== "object") {
    return null;
  }
  const record = context as {
    headers?: Headers;
    request?: { headers?: Headers };
  };
  if (record.headers && typeof record.headers.get === "function") {
    return record.headers;
  }
  if (record.request?.headers && typeof record.request.headers.get === "function") {
    return record.request.headers;
  }
  return null;
}

export function replaceOtherSessionsRequested(
  context: unknown,
  headerName: string,
): boolean {
  return requestHeaders(context)?.get(headerName) === "1";
}

/**
 * Block a new session while another unexpired one exists.
 * When replace is set, those other rows are deleted first.
 */
export async function enforceSingleSessionOnCreate(
  userId: string,
  replaceOtherSessions: boolean,
  now = new Date(),
): Promise<void> {
  await deleteIdleSessions(now, userId);
  const existing = await prisma.session.findMany({
    where: { userId },
    select: { id: true, expiresAt: true },
  });
  const decision = decideSessionCreate({
    existing,
    now,
    replaceOtherSessions,
  });
  if (!decision.allow) {
    throw new APIError("FORBIDDEN", {
      message: ALREADY_SIGNED_IN_MESSAGE,
    });
  }
  if (decision.revokeIds.length > 0) {
    await prisma.session.deleteMany({
      where: { id: { in: decision.revokeIds } },
    });
  }
}
