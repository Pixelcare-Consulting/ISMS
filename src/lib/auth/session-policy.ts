/** No clicks, keys, or scrolling for this long signs the person out. */
export const SESSION_IDLE_MS = 5 * 60 * 1000;

/** Sent with sign-in when the person chooses to replace the other device. */
export const REPLACE_OTHER_SESSIONS_HEADER = "x-isms-replace-sessions";

export const ALREADY_SIGNED_IN_MESSAGE =
  "Looks like this account is already signed in on another device. Please sign out there before continuing.";

export const SIGNED_OUT_ELSEWHERE_MESSAGE =
  "You were signed out because this account signed in somewhere else.";

export const IDLE_SIGNOUT_MESSAGE =
  "You were signed out after 5 minutes of inactivity.";

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

/** Reject a missing row, an expired row, or one idle longer than 5 minutes. */
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
