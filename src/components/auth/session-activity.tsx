"use client";

import { useEffect } from "react";

import { authClient } from "@/lib/auth/client";
import {
  LOGIN_ERROR_IDLE,
  LOGIN_ERROR_SIGNED_IN_ELSEWHERE,
  SESSION_IDLE_MS,
} from "@/lib/auth/session-policy";

const PING_GAP_MS = 60_000;
const WATCH_MS = 15_000;

/**
 * Records clicks, keys, and scrolling, and signs out after 15 idle minutes.
 * A separate read notices when this session row was removed elsewhere.
 * The read does not refresh last activity.
 */
export function SessionActivity() {
  useEffect(() => {
    let lastInput = Date.now();
    let lastPing = 0;
    let lastRead = 0;
    let stopped = false;

    async function leave(error: string) {
      if (stopped) return;
      stopped = true;
      try {
        await authClient.signOut({
          fetchOptions: { credentials: "include" },
        });
      } catch {
        // The login page still explains the sign-out if the cookie clear fails.
      }
      // Full load so the cleared session cookie is what the login page receives.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- sign-out must not reuse the signed-in app shell
      window.location.assign(`/login?error=${error}`);
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
        await leave(error === "idle" ? LOGIN_ERROR_IDLE : error === "expired" ? "session-expired" : LOGIN_ERROR_SIGNED_IN_ELSEWHERE);
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
        await leave(
          error === "idle"
            ? LOGIN_ERROR_IDLE
            : error === "expired"
              ? "session-expired"
              : LOGIN_ERROR_SIGNED_IN_ELSEWHERE,
        );
      } catch {
        // Ignore a dropped check. The next navigation still runs requireAuth.
      }
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
    void readLiveness();

    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("click", onActivity, listen);
      window.removeEventListener("keydown", onActivity, listen);
      window.removeEventListener("scroll", onActivity, listen);
    };
  }, []);

  return null;
}
