"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";

import {
  establishSapSessionAction,
  getSapSessionStatusAction,
  logoutSapSessionAction,
} from "@/features/sap/actions/sap.actions";
import type { SapSessionPublicStatus } from "@/features/sap/types/sap-service-layer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";

const STATUS_POLL_MS = 10_000;

function formatCountdown(expiresAt: number, now: number): string {
  const remainingMs = Math.max(0, expiresAt - now);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function statusLabel(status: SapSessionPublicStatus | null): string {
  if (!status) return "Loading…";
  switch (status.state) {
    case "no_config":
      return "No active config";
    case "idle":
      return "Idle";
    case "connected":
      return "Connected";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function statusBadgeVariant(
  status: SapSessionPublicStatus | null,
): "default" | "secondary" | "outline" {
  if (!status) return "outline";
  switch (status.state) {
    case "connected":
      return "default";
    case "idle":
      return "secondary";
    case "no_config":
      return "outline";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

interface SapSessionStatusProps {
  /** Bump after config save/activate/delete so status reloads. */
  refreshKey?: number;
}

export function SapSessionStatus({ refreshKey = 0 }: SapSessionStatusProps) {
  const [status, setStatus] = useState<SapSessionPublicStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const loadStatus = useEffectEvent(async () => {
    const result = await getSapSessionStatusAction();
    if ("error" in result) {
      toast.error(result.error);
      setIsLoading(false);
      return;
    }
    setStatus(result.status);
    setIsLoading(false);
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStatus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshKey]);

  useEffect(() => {
    const poll = window.setInterval(() => {
      void loadStatus();
    }, STATUS_POLL_MS);
    return () => window.clearInterval(poll);
  }, []);

  useEffect(() => {
    if (status?.state !== "connected") return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [status?.state]);

  async function connect() {
    if (!status || status.state === "no_config") return;
    setIsConnecting(true);
    const result = await establishSapSessionAction({ configId: status.configId });
    setIsConnecting(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setStatus(result.status);
    setNow(Date.now());
    toast.success("SAP session connected");
  }

  async function logout() {
    if (!status || status.state !== "connected") return;
    setIsLoggingOut(true);
    const result = await logoutSapSessionAction({ configId: status.configId });
    setIsLoggingOut(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setStatus(result.status);
    toast.success("SAP session logged out");
  }

  const showConnect = status?.state === "idle" || status?.state === "connected";
  const showLogout = status?.state === "connected";
  const connectDisabled =
    isConnecting || isLoggingOut || status?.state !== "idle";

  return (
    <div className="space-y-2 border-b pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">Session status</p>
            <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>
          </div>
          {status?.state === "connected" || status?.state === "idle" ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{status.companyDb}</span>
              {status.state === "connected" ? (
                <>
                  {" · "}
                  Session {status.sessionIdMasked}
                  {" · "}
                  <span className="tabular-nums">{formatCountdown(status.expiresAt, now)}</span>
                </>
              ) : (
                " · No cached session"
              )}
            </p>
          ) : status?.state === "no_config" ? (
            <p className="text-sm text-muted-foreground">
              Activate a company DB configuration to connect.
            </p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Checking session…</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {showConnect ? (
            <Button
              size="sm"
              variant="outline"
              disabled={connectDisabled}
              onClick={connect}
            >
              {isConnecting ? <LoadingIndicator label="Connecting..." /> : "Connect"}
            </Button>
          ) : null}
          {showLogout ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isConnecting || isLoggingOut}
              onClick={logout}
            >
              {isLoggingOut ? <LoadingIndicator label="Logging out..." /> : "Logout"}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Shared company session for everyone using this connection — stays Connected after refresh
        while the live link is still valid. Test connection logs in then out and does not keep a
        session.
      </p>
    </div>
  );
}
