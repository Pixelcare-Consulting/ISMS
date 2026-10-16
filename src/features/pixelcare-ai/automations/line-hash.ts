import { createHash } from "node:crypto";

import type { ReplenishmentLine } from "@/features/pixelcare-ai/automations/proposal-lines";
import { orderableReplenishmentLines } from "@/features/pixelcare-ai/automations/proposal-lines";

export function hashOrderableLines(lines: readonly ReplenishmentLine[]): string {
  const canonical = orderableReplenishmentLines(lines)
    .map((line) => ({
      modelId: line.modelId,
      sku: line.sku,
      shelfMax: line.shelfMax,
      stk: line.stk,
      sug: line.sug,
    }))
    .sort((left, right) => left.modelId.localeCompare(right.modelId) || left.sku.localeCompare(right.sku));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export type ConfirmationRowState = {
  userId: string;
  proposalId: string;
  lineHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export type ConfirmationDecision =
  | { ok: true }
  | {
      ok: false;
      reason: "missing" | "expired" | "used" | "hash" | "permission" | "scope" | "owner";
    };

export function assessConfirmation(input: {
  row: ConfirmationRowState | null;
  actorUserId: string;
  proposalId: string;
  currentLineHash: string;
  now: Date;
  canCreate: boolean;
  branchInScope: boolean;
  isOwner: boolean;
}): ConfirmationDecision {
  if (!input.row || input.row.userId !== input.actorUserId || input.row.proposalId !== input.proposalId) {
    return { ok: false, reason: "missing" };
  }
  if (!input.isOwner) return { ok: false, reason: "owner" };
  if (input.row.usedAt) return { ok: false, reason: "used" };
  if (input.row.expiresAt.getTime() <= input.now.getTime()) return { ok: false, reason: "expired" };
  if (input.row.lineHash !== input.currentLineHash) return { ok: false, reason: "hash" };
  if (!input.canCreate) return { ok: false, reason: "permission" };
  if (!input.branchInScope) return { ok: false, reason: "scope" };
  return { ok: true };
}

export function confirmationDenialMessage(reason: Exclude<ConfirmationDecision, { ok: true }>["reason"]): string {
  switch (reason) {
    case "missing":
      return "Confirm this proposal from the Confirm order button.";
    case "expired":
      return "That confirmation expired. Review the proposal and try again.";
    case "used":
      return "That confirmation was already used.";
    case "hash":
      return "The proposal changed. Review it again before confirming.";
    case "permission":
      return "You do not have permission to create this order.";
    case "scope":
      return "That store is outside your area.";
    case "owner":
      return "Only the automation owner can confirm this proposal.";
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}
