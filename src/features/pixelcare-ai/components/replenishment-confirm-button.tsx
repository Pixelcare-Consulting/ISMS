"use client";

import { useEffect, useState, useTransition } from "react";

import {
  confirmProposalAction,
  issueReplenishmentConfirmationAction,
} from "@/features/pixelcare-ai/actions/automation.actions";
import { Button } from "@/components/ui/button";

export function proposalIdsFromToolOutput(output: unknown): string[] {
  if (!output || typeof output !== "object") return [];
  const record = output as Record<string, unknown>;
  const ids: string[] = [];
  if (typeof record.proposalId === "string") ids.push(record.proposalId);
  if (Array.isArray(record.proposals)) {
    for (const item of record.proposals) {
      if (!item || typeof item !== "object") continue;
      const proposalId = (item as { proposalId?: unknown }).proposalId;
      if (typeof proposalId === "string" && proposalId.trim()) ids.push(proposalId);
    }
  }
  return [...new Set(ids)];
}

export function ReplenishmentConfirmButton(props: { proposalId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void issueReplenishmentConfirmationAction(props.proposalId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setToken(result.token);
        return;
      }
      setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [props.proposalId]);

  function onConfirm() {
    if (!token) return;
    startTransition(async () => {
      const result = await confirmProposalAction({
        proposalId: props.proposalId,
        confirmationToken: token,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(
        result.result.created
          ? "Order created. It was not sent to SAP."
          : "This proposal already has an order.",
      );
    });
  }

  return (
    <div className="space-y-1">
      <Button type="button" size="sm" disabled={!token || pending || Boolean(done)} onClick={onConfirm}>
        Confirm order
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {done ? <p className="text-xs text-muted-foreground">{done}</p> : null}
    </div>
  );
}
