import {
  SESSION_IDLE_MS,
  decideSessionCreate,
  evaluateLiveSession,
  isLoginPathname,
  isRecentPageUse,
  isTerminalLoginError,
  loginErrorMessage,
  resolveLiveSessionOnRequest,
  shouldRevokeBrowserSession,
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

  it("rejects a session that has been idle longer than 5 minutes", () => {
    const state = evaluateLiveSession({
      row: {
        expiresAt,
        lastActiveAt: new Date(now.getTime() - 5 * 60 * 1000 - 1),
      },
      now,
    });

    expect(state).toBe("idle");
  });

  it("keeps a session that was active 4 minutes ago", () => {
    const state = evaluateLiveSession({
      row: {
        expiresAt,
        lastActiveAt: new Date(now.getTime() - 4 * 60 * 1000),
      },
      now,
    });

    expect(state).toBe("ok");
  });

  it("keeps a session that was active exactly 5 minutes ago", () => {
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

  it("keeps an active request inside the idle window signed in and treats no activity for more than 5 minutes as idle", () => {
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
    const insideWindow = new Date(now.getTime() - 4 * 60 * 1000);
    const pastWindow = new Date(now.getTime() - SESSION_IDLE_MS - 1);

    const active = resolveLiveSessionOnRequest({
      row: { expiresAt, lastActiveAt: insideWindow },
      now,
      activity: "active",
    });
    expect(active.state).toBe("ok");
    expect(active.lastActiveAt).toEqual(now);
    expect(active.expiresAt).toEqual(expiresAt);

    const idle = resolveLiveSessionOnRequest({
      row: { expiresAt, lastActiveAt: pastWindow },
      now,
      activity: "none",
    });
    expect(idle.state).toBe("idle");
    expect(idle.lastActiveAt).toEqual(pastWindow);
    expect(idle.expiresAt).toEqual(expiresAt);

    const pageOpenedAfterQuiet = resolveLiveSessionOnRequest({
      row: { expiresAt, lastActiveAt: pastWindow },
      now,
      activity: "active",
    });
    expect(pageOpenedAfterQuiet.state).toBe("ok");
    expect(pageOpenedAfterQuiet.lastActiveAt).toEqual(now);
    expect(pageOpenedAfterQuiet.expiresAt).toEqual(expiresAt);
  });
});

describe("session expired dialog", () => {
  it("stays hidden while the person is using the page and on the login page", () => {
    const lastInputAt = now.getTime() - 4 * 60 * 1000;
    expect(isRecentPageUse(lastInputAt, now.getTime())).toBe(true);
    expect(isRecentPageUse(now.getTime() - SESSION_IDLE_MS - 1, now.getTime())).toBe(
      false,
    );
    expect(isLoginPathname("/login")).toBe(true);
    expect(isLoginPathname("/login/forgot")).toBe(true);
    expect(isLoginPathname("/dashboard")).toBe(false);
  });
});

describe("shouldRevokeBrowserSession", () => {
  it("revokes when this tab still owns the current session", () => {
    expect(
      shouldRevokeBrowserSession({
        tabSessionId: "session-a",
        currentSessionId: "session-a",
      }),
    ).toBe(true);
  });

  it("does not revoke when another sign-in replaced the session", () => {
    expect(
      shouldRevokeBrowserSession({
        tabSessionId: "session-a",
        currentSessionId: "session-b",
      }),
    ).toBe(false);
  });

  it("revokes when the current session is already gone", () => {
    expect(
      shouldRevokeBrowserSession({
        tabSessionId: "session-a",
        currentSessionId: "",
      }),
    ).toBe(true);
  });
});

describe("isTerminalLoginError", () => {
  it("keeps forced sign-out reasons on the login page", () => {
    expect(isTerminalLoginError("idle")).toBe(true);
    expect(isTerminalLoginError("signed-in-elsewhere")).toBe(true);
    expect(isTerminalLoginError("session-expired")).toBe(true);
    expect(isTerminalLoginError("disabled")).toBe(true);
    expect(loginErrorMessage("idle")).toBe(
      "You were signed out after 5 minutes of inactivity.",
    );
    expect(isTerminalLoginError(null)).toBe(false);
    expect(isTerminalLoginError("forbidden")).toBe(false);
  });
});
