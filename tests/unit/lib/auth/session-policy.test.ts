import {
  SESSION_IDLE_MS,
  decideSessionCreate,
  evaluateLiveSession,
  isTerminalLoginError,
} from "@/lib/auth/session-policy";

const now = new Date("2026-11-17T12:00:00.000Z");

function session(id: string, expiresAt: Date) {
  return { id, expiresAt };
}

describe("decideSessionCreate", () => {
  it("blocks a second sign-in while another session has not expired", () => {
    const decision = decideSessionCreate({
      existing: [session("other", new Date(now.getTime() + 60_000))],
      now,
      replaceOtherSessions: false,
    });

    expect(decision).toEqual({ allow: false });
  });

  it("signs the other session out when replace is chosen", () => {
    const decision = decideSessionCreate({
      existing: [
        session("other", new Date(now.getTime() + 60_000)),
        session("expired", new Date(now.getTime() - 1_000)),
      ],
      now,
      replaceOtherSessions: true,
    });

    expect(decision).toEqual({ allow: true, revokeIds: ["other"] });
  });

  it("allows sign-in when every other session is already expired", () => {
    const decision = decideSessionCreate({
      existing: [session("expired", new Date(now.getTime() - 1_000))],
      now,
      replaceOtherSessions: false,
    });

    expect(decision).toEqual({ allow: true, revokeIds: [] });
  });
});

describe("evaluateLiveSession", () => {
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

  it("rejects a session that has been idle longer than 15 minutes", () => {
    const state = evaluateLiveSession({
      row: {
        expiresAt,
        lastActiveAt: new Date(now.getTime() - SESSION_IDLE_MS - 1),
      },
      now,
    });

    expect(state).toBe("idle");
  });

  it("keeps a session that was active exactly 15 minutes ago", () => {
    const state = evaluateLiveSession({
      row: {
        expiresAt,
        lastActiveAt: new Date(now.getTime() - SESSION_IDLE_MS),
      },
      now,
    });

    expect(state).toBe("ok");
  });

  it("rejects a missing session row", () => {
    expect(evaluateLiveSession({ row: null, now })).toBe("missing");
  });
});

describe("isTerminalLoginError", () => {
  it("keeps forced sign-out reasons on the login page", () => {
    expect(isTerminalLoginError("idle")).toBe(true);
    expect(isTerminalLoginError("signed-in-elsewhere")).toBe(true);
    expect(isTerminalLoginError("session-expired")).toBe(true);
    expect(isTerminalLoginError(null)).toBe(false);
    expect(isTerminalLoginError("forbidden")).toBe(false);
  });
});
