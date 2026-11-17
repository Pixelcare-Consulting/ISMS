/** No clicks, keys, or scrolling for this long signs the person out. */
export const SESSION_IDLE_MS = 15 * 60 * 1000;

/** Sent with sign-in when the person chooses to replace the other device. */
export const REPLACE_OTHER_SESSIONS_HEADER = "x-isms-replace-sessions";

export const ALREADY_SIGNED_IN_MESSAGE =
  "Looks like this account is already signed in on another device. Please sign out there before continuing.";

export const SIGNED_OUT_ELSEWHERE_MESSAGE =
  "You were signed out because this account signed in somewhere else.";

export const IDLE_SIGNOUT_MESSAGE =
  "You were signed out after 15 minutes of inactivity.";

export const LOGIN_ERROR_SIGNED_IN_ELSEWHERE = "signed-in-elsewhere";
export const LOGIN_ERROR_IDLE = "idle";

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

/** Reject a missing row, an expired row, or one idle longer than 15 minutes. */
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

export function loginErrorMessage(code: string | null): string | null {
  if (code === LOGIN_ERROR_IDLE) {
    return IDLE_SIGNOUT_MESSAGE;
  }
  if (code === LOGIN_ERROR_SIGNED_IN_ELSEWHERE) {
    return SIGNED_OUT_ELSEWHERE_MESSAGE;
  }
  if (code === "session-expired") {
    return "Your session is no longer valid. Sign in again.";
  }
  return null;
}

export function isAlreadySignedInMessage(message: string | null | undefined): boolean {
  return (message ?? "").includes("already signed in on another device");
}
