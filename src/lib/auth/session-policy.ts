/**
 * No clicks, keys, scrolling, or page use for this long signs the person out.
 * This is not a session lifetime. `expiresAt` stays the normal length.
 */
export const SESSION_IDLE_MS = 30 * 60 * 1000;

/** Sent with sign-in when the person chooses to replace the other device. */
export const REPLACE_OTHER_SESSIONS_HEADER = "x-isms-replace-sessions";

export const ALREADY_SIGNED_IN_MESSAGE =
  "Looks like this account is already signed in on another device. Please sign out there before continuing.";

export const SIGNED_OUT_ELSEWHERE_MESSAGE =
  "You were signed out because this account signed in somewhere else.";

export const IDLE_SIGNOUT_MESSAGE =
  "You were signed out. Please sign in again.";

export const DISABLED_ACCOUNT_MESSAGE =
  "This account is disabled. Ask an administrator to turn it back on.";

export const LOGIN_ERROR_SIGNED_IN_ELSEWHERE = "signed-in-elsewhere";
export const LOGIN_ERROR_IDLE = "idle";
export const LOGIN_ERROR_SESSION_EXPIRED = "session-expired";
export const LOGIN_ERROR_DISABLED = "disabled";

const TERMINAL_LOGIN_ERRORS = new Set<string>([
  LOGIN_ERROR_IDLE,
  LOGIN_ERROR_SIGNED_IN_ELSEWHERE,
  LOGIN_ERROR_SESSION_EXPIRED,
  LOGIN_ERROR_DISABLED,
]);

/**
 * These login URLs are the end of a sign-out. A leftover cookie must not send
 * the browser back into the app, or the app signs them out and the page reloads forever.
 */
export function isTerminalLoginError(code: string | null): boolean {
  return code !== null && TERMINAL_LOGIN_ERRORS.has(code);
}

export type SessionStamp = {
  id: string;
  expiresAt: Date;
};

export type SessionCreateDecision =
  | { allow: true; revokeIds: string[] }
  | { allow: false };

/**
 * A second sign-in is blocked while another session has not expired.
 * Replacing returns the ids to delete before the new session is created.
 */
export function decideSessionCreate(input: {
  existing: readonly SessionStamp[];
  now: Date;
  replaceOtherSessions: boolean;
}): SessionCreateDecision {
  const active = input.existing.filter(
    (session) => session.expiresAt.getTime() > input.now.getTime(),
  );
  if (active.length === 0) {
    return { allow: true, revokeIds: [] };
  }
  if (input.replaceOtherSessions) {
    return { allow: true, revokeIds: active.map((session) => session.id) };
  }
  return { allow: false };
}

export type LiveSessionRow = {
  expiresAt: Date;
  lastActiveAt: Date;
};

export type LiveSessionState = "ok" | "missing" | "expired" | "idle";

/**
 * `active` is a page open or an action the person started.
 * `none` is a liveness read that does not count as use.
 */
export type RequestActivity = "active" | "none";

export type LiveSessionDecision = {
  state: LiveSessionState;
  /** Stamp to persist. An active request moves this to `now` before the idle check. */
  lastActiveAt: Date | null;
  /** Unchanged. Thirty minutes never shortens the session lifetime. */
  expiresAt: Date | null;
};

/** Reject a missing row, an expired row, or one idle longer than 30 minutes. */
export function evaluateLiveSession(input: {
  row: LiveSessionRow | null;
  now: Date;
  idleMs?: number;
}): LiveSessionState {
  if (!input.row) {
    return "missing";
  }
  if (input.row.expiresAt.getTime() <= input.now.getTime()) {
    return "expired";
  }
  const idleMs = input.idleMs ?? SESSION_IDLE_MS;
  if (input.now.getTime() - input.row.lastActiveAt.getTime() > idleMs) {
    return "idle";
  }
  return "ok";
}

function stampForRequest(input: {
  activity: RequestActivity;
  now: Date;
  lastActiveAt: Date;
}): Date {
  switch (input.activity) {
    case "active":
      return input.now;
    case "none":
      return input.lastActiveAt;
    default: {
      const _exhaustive: never = input.activity;
      return _exhaustive;
    }
  }
}

/**
 * Opening a page or running an action counts as activity, so `lastActiveAt`
 * moves to `now` before the idle check and the person stays signed in.
 * A request with no activity keeps the stored stamp: more than 30 minutes is idle.
 */
export function resolveLiveSessionOnRequest(input: {
  row: LiveSessionRow | null;
  now: Date;
  activity: RequestActivity;
  idleMs?: number;
}): LiveSessionDecision {
  if (!input.row) {
    return { state: "missing", lastActiveAt: null, expiresAt: null };
  }
  if (input.row.expiresAt.getTime() <= input.now.getTime()) {
    return {
      state: "expired",
      lastActiveAt: input.row.lastActiveAt,
      expiresAt: input.row.expiresAt,
    };
  }

  const lastActiveAt = stampForRequest({
    activity: input.activity,
    now: input.now,
    lastActiveAt: input.row.lastActiveAt,
  });
  return {
    state: evaluateLiveSession({
      row: { expiresAt: input.row.expiresAt, lastActiveAt },
      now: input.now,
      idleMs: input.idleMs,
    }),
    lastActiveAt,
    expiresAt: input.row.expiresAt,
  };
}

/** True while the last click, key, scroll, or page use is still inside 30 minutes. */
export function isRecentPageUse(
  lastInputAt: number,
  now: number,
  idleMs = SESSION_IDLE_MS,
): boolean {
  return now - lastInputAt < idleMs;
}

export function isLoginPathname(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}

export type ShownLoginNotice = {
  message: string;
  /** Same page, without the terminal error, so a later load does not request it. */
  href: string;
};

/**
 * A forced sign-out may open /login?error= once so the message can render.
 * After that the address is /login. Asking again would keep fetching the error URL.
 */
export function shownLoginNotice(input: {
  pathname: string;
  search: string;
}): ShownLoginNotice | null {
  const params = new URLSearchParams(
    input.search.startsWith("?") ? input.search.slice(1) : input.search,
  );
  const code = params.get("error");
  if (!isTerminalLoginError(code)) return null;
  const message = loginErrorMessage(code);
  if (!message) return null;
  params.delete("error");
  const query = params.toString();
  const pathname = input.pathname.length > 0 ? input.pathname : "/login";
  return {
    message,
    href: query.length > 0 ? `${pathname}?${query}` : pathname,
  };
}

/** True only before the person reaches the login page. The error URL is not opened again. */
export function shouldOpenLoginError(pathname: string): boolean {
  return !isLoginPathname(pathname);
}

export function isDisabledAccountMessage(message: string | null | undefined): boolean {
  return (message ?? "").toLowerCase().includes("account is disabled");
}

export function loginErrorMessage(code: string | null): string | null {
  if (code === LOGIN_ERROR_IDLE) {
    return IDLE_SIGNOUT_MESSAGE;
  }
  if (code === LOGIN_ERROR_DISABLED) {
    return DISABLED_ACCOUNT_MESSAGE;
  }
  if (code === LOGIN_ERROR_SIGNED_IN_ELSEWHERE) {
    return SIGNED_OUT_ELSEWHERE_MESSAGE;
  }
  if (code === LOGIN_ERROR_SESSION_EXPIRED) {
    return "Your session is no longer valid. Sign in again.";
  }
  return null;
}

export function isAlreadySignedInMessage(message: string | null | undefined): boolean {
  return (message ?? "").includes("already signed in on another device");
}

/**
 * Clear the shared browser cookie only when this tab still owns that session.
 * An empty current id after this tab had one means the row is already gone.
 * A different current id means someone signed in again in this browser.
 */
export function shouldRevokeBrowserSession(input: {
  tabSessionId: string | null | undefined;
  currentSessionId: string | null | undefined;
}): boolean {
  const tabId = input.tabSessionId?.trim() ?? "";
  if (tabId.length === 0) return false;
  const currentId = input.currentSessionId?.trim() ?? "";
  if (currentId.length === 0) return true;
  return tabId === currentId;
}
