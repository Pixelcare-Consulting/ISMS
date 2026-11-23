import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { toAppSession } from "@/lib/auth/session";
import {
  deleteIdleSessions,
  isAccountDisabled,
  readLiveSessionState,
  touchSessionActivity,
} from "@/lib/auth/session-liveness";
import { prisma } from "@/lib/database/client";

async function currentSession() {
  const session = toAppSession(await auth());
  if (!session?.user.id || !session.sessionId) {
    return null;
  }
  return session;
}

function rejected(state: string) {
  return NextResponse.json({ error: state }, { status: 401 });
}

async function rejectIfDisabled(userId: string) {
  if (!(await isAccountDisabled(userId))) return null;
  await prisma.session.deleteMany({ where: { userId } });
  return rejected("disabled");
}

/** Read whether this session row is still live. Does not refresh activity. */
export async function GET() {
  const session = await currentSession();
  if (!session?.sessionId) {
    return rejected("missing");
  }
  const disabled = await rejectIfDisabled(session.user.id);
  if (disabled) return disabled;

  const state = await readLiveSessionState(session.sessionId, session.user.id);
  await deleteIdleSessions();
  if (state !== "ok") {
    return rejected(state);
  }
  return NextResponse.json({ ok: true });
}

/** Refresh last activity while the person is still within the idle window. */
export async function POST() {
  const session = await currentSession();
  if (!session?.sessionId) {
    return rejected("missing");
  }
  const disabled = await rejectIfDisabled(session.user.id);
  if (disabled) return disabled;

  const state = await touchSessionActivity(session.sessionId, session.user.id);
  await deleteIdleSessions();
  if (state !== "ok") {
    return rejected(state);
  }
  return new NextResponse(null, { status: 204 });
}
