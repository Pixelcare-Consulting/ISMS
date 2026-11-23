"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { authClient } from "@/lib/auth/client";
import {
  LOGIN_ERROR_DISABLED,
  LOGIN_ERROR_IDLE,
  LOGIN_ERROR_SESSION_EXPIRED,
  LOGIN_ERROR_SIGNED_IN_ELSEWHERE,
  SESSION_IDLE_MS,
  shouldRevokeBrowserSession,
} from "@/lib/auth/session-policy";

const PING_GAP_MS = 60_000;
const WATCH_MS = 15_000;

async function readBrowserSessionId(): Promise<string | null> {
  try {
    const result = await authClient.getSession({
      query: { disableCookieCache: true },
    });
    const id = result.data?.session?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

function goToLogin(error: string) {
  // Full load so the login page does not reuse the signed-in app shell.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- sign-out must not reuse the signed-in app shell
  window.location.assign(`/login?error=${error}`);
}

/** Idle and expired kicks pause on the current page. The login page already explains them. */
function holdsForSessionExpiredDialog(error: string): boolean {
  if (error !== LOGIN_ERROR_IDLE && error !== LOGIN_ERROR_SESSION_EXPIRED) {
    return false;
  }
  const path = window.location.pathname;
  return path !== "/login" && !path.startsWith("/login/");
}

/**
 * Records clicks, keys, and scrolling, and signs out after 5 idle minutes.
 * A separate read notices when this session row was removed elsewhere.
 * The read does not refresh last activity.
 */
export function SessionActivity() {
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const finishSignOutRef = useRef<(error: string) => Promise<void>>(
    async () => {},
  );

  useEffect(() => {
    let lastInput = Date.now();
    let lastPing = 0;
    let lastRead = 0;
    let stopped = false;
    let tabSessionId: string | null = null;
    let capture: Promise<string | null> | null = null;

    function captureTabSession(): Promise<string | null> {
      if (tabSessionId) return Promise.resolve(tabSessionId);
      if (!capture) {
        capture = readBrowserSessionId().then((id) => {
          if (id) tabSessionId = id;
          else capture = null;
          return tabSessionId;
        });
      }
      return capture;
    }

    async function finishSignOut(error: string) {
      const ownedId = await captureTabSession();
      const currentSessionId = await readBrowserSessionId();
      if (
        !shouldRevokeBrowserSession({
          tabSessionId: ownedId,
          currentSessionId,
        })
      ) {
        goToLogin(LOGIN_ERROR_SIGNED_IN_ELSEWHERE);
        return;
      }
      try {
        await authClient.signOut({
          fetchOptions: { credentials: "include" },
        });
      } catch {
        // The login page still explains the sign-out if the cookie clear fails.
      }
      goToLogin(error);
    }

    finishSignOutRef.current = finishSignOut;

    async function leave(error: string) {
      if (stopped) return;
      stopped = true;
      if (holdsForSessionExpiredDialog(error)) {
        setPendingError(error);
        return;
      }
      await finishSignOut(error);
    }

    async function readBody(response: Response): Promise<string | null> {
      try {
        const body = (await response.json()) as { error?: string };
        return body.error ?? null;
      } catch {
        return null;
      }
    }

    async function ping() {
      if (stopped) return;
      lastPing = Date.now();
      try {
        const response = await fetch("/api/session-activity", {
          method: "POST",
          credentials: "include",
        });
        if (response.ok || stopped) return;
        const error = await readBody(response);
        await leave(loginErrorFor(error));
      } catch {
        // A failed request is not inactivity.
      }
    }

    async function readLiveness() {
      if (stopped) return;
      lastRead = Date.now();
      try {
        const response = await fetch("/api/session-activity", {
          method: "GET",
          credentials: "include",
        });
        if (response.ok || stopped) return;
        const error = await readBody(response);
        if (error === "idle" && Date.now() - lastInput < SESSION_IDLE_MS) {
          return;
        }
        await leave(loginErrorFor(error));
      } catch {
        // Ignore a dropped check. The next navigation still runs requireAuth.
      }
    }

    function loginErrorFor(error: string | null): string {
      if (error === "idle") return LOGIN_ERROR_IDLE;
      if (error === "expired") return LOGIN_ERROR_SESSION_EXPIRED;
      if (error === "disabled") return LOGIN_ERROR_DISABLED;
      return LOGIN_ERROR_SIGNED_IN_ELSEWHERE;
    }

    function onActivity() {
      if (stopped) return;
      const now = Date.now();
      lastInput = now;
      if (now - lastPing < PING_GAP_MS) return;
      void ping();
    }

    const interval = window.setInterval(() => {
      if (stopped) return;
      if (Date.now() - lastInput >= SESSION_IDLE_MS) {
        void leave(LOGIN_ERROR_IDLE);
        return;
      }
      if (Date.now() - lastRead >= PING_GAP_MS) {
        void readLiveness();
      }
    }, WATCH_MS);

    const listen: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener("click", onActivity, listen);
    window.addEventListener("keydown", onActivity, listen);
    window.addEventListener("scroll", onActivity, listen);
    void captureTabSession();
    void readLiveness();

    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("click", onActivity, listen);
      window.removeEventListener("keydown", onActivity, listen);
      window.removeEventListener("scroll", onActivity, listen);
    };
  }, []);

  async function onOk(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (!pendingError || confirming) return;
    setConfirming(true);
    await finishSignOutRef.current(pendingError);
  }

  return (
    <AlertDialog
      open={pendingError !== null}
      onOpenChange={() => {
        // Stay on this page until OK signs the person out.
      }}
    >
      <AlertDialogContent className="z-[200]" overlayClassName="z-[200]">
        <AlertDialogHeader>
          <AlertDialogTitle>SESSION EXPIRED</AlertDialogTitle>
          <AlertDialogDescription>
            Your session has been expired. Please re-login again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction disabled={confirming} onClick={onOk}>
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
