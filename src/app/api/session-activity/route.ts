import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { toAppSession } from "@/lib/auth/session";
import {
  readLiveSessionState,
  touchSessionActivity,
} from "@/lib/auth/session-liveness";

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

/** Read whether this session row is still live. Does not refresh activity. */
export async function GET() {
  const session = await currentSession();
  if (!session?.sessionId) {
    return rejected("missing");
  }
  const state = await readLiveSessionState(session.sessionId, session.user.id);
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
  const state = await touchSessionActivity(session.sessionId, session.user.id);
  if (state !== "ok") {
    return rejected(state);
  }
  return new NextResponse(null, { status: 204 });
}
