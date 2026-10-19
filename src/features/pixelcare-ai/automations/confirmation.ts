import {
  AI_CONFIRMATION_TTL_MS,
  messageForAssistantGate,
} from "@/features/ai/constants/assistant-limits";
import { logAiAction } from "@/features/ai/lib/audit";
import {
  AssistantUserError,
  createConfirmationToken,
  hashConfirmationToken,
} from "@/features/ai/lib/assistant-messages";
import { readAiAssistantGate } from "@/features/ai/services/assistant-policy.service";
import {
  assessConfirmation,
  confirmationDenialMessage,
  hashOrderableLines,
} from "@/features/pixelcare-ai/automations/line-hash";
import {
  AutomationAccessError,
  assertCanCreateReplenishment,
  loadOwnerAccess,
  resolveScopedBranches,
} from "@/features/pixelcare-ai/automations/owner-access";
import {
  confirmReplenishmentProposal,
  parseStoredProposalLines,
  type ConfirmProposalResult,
} from "@/features/pixelcare-ai/automations/replenishment";
import { prisma } from "@/lib/database/client";

function asUserError(error: unknown): never {
  if (error instanceof AssistantUserError || error instanceof AutomationAccessError) {
    throw error;
  }
  throw new AssistantUserError("The order could not be confirmed.");
}

async function loadOwnedProposal(tenantId: string, proposalId: string) {
  return prisma.aiReplenishmentProposal.findFirst({
    where: { id: proposalId, tenantId },
    select: {
      id: true,
      branchId: true,
      lines: true,
      lineHash: true,
      status: true,
      orderId: true,
      run: { select: { automation: { select: { ownerUserId: true } } } },
    },
  });
}

export async function issueReplenishmentConfirmation(input: {
  tenantId: string;
  userId: string;
  proposalId: string;
  now?: Date;
}): Promise<{ token: string; expiresAt: Date }> {
  const policy = await readAiAssistantGate(input.tenantId);
  if (!policy.ok) {
    throw new AssistantUserError(messageForAssistantGate(policy.reason).error);
  }

  const proposal = await loadOwnedProposal(input.tenantId, input.proposalId);
  if (!proposal) throw new AssistantUserError("Proposal not found.");
  if (proposal.run.automation.ownerUserId !== input.userId) {
    throw new AssistantUserError("Only the automation owner can confirm this proposal.");
  }
  if (proposal.status !== "proposed" || proposal.orderId) {
    throw new AssistantUserError("This proposal is no longer open.");
  }

  let lineHash = proposal.lineHash;
  if (!lineHash) {
    try {
      lineHash = hashOrderableLines(parseStoredProposalLines(proposal.lines));
    } catch {
      throw new AssistantUserError("This proposal cannot be confirmed. Prepare it again.");
    }
    await prisma.aiReplenishmentProposal.update({
      where: { id: proposal.id },
      data: { lineHash },
    });
  }

  const access = await loadOwnerAccess(input.tenantId, input.userId);
  try {
    assertCanCreateReplenishment(access);
    resolveScopedBranches([proposal.branchId], access);
  } catch (error) {
    asUserError(error);
  }

  const now = input.now ?? new Date();
  const token = createConfirmationToken();
  const expiresAt = new Date(now.getTime() + AI_CONFIRMATION_TTL_MS);
  await prisma.aiReplenishmentConfirmation.deleteMany({
    where: { tenantId: input.tenantId, userId: input.userId, proposalId: proposal.id, usedAt: null },
  });
  await prisma.aiReplenishmentConfirmation.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      proposalId: proposal.id,
      lineHash,
      tokenHash: hashConfirmationToken(token),
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export async function confirmReplenishmentWithToken(input: {
  tenantId: string;
  actorUserId: string;
  proposalId: string;
  confirmationToken: string;
  now?: Date;
}): Promise<ConfirmProposalResult> {
  const token = input.confirmationToken.trim();
  if (!token) {
    throw new AssistantUserError(confirmationDenialMessage("missing"));
  }

  const policy = await readAiAssistantGate(input.tenantId);
  if (!policy.ok) {
    throw new AssistantUserError(messageForAssistantGate(policy.reason).error);
  }

  const proposal = await loadOwnedProposal(input.tenantId, input.proposalId);
  if (!proposal) throw new AssistantUserError("Proposal not found.");

  let currentLineHash: string;
  try {
    currentLineHash = hashOrderableLines(parseStoredProposalLines(proposal.lines));
  } catch {
    throw new AssistantUserError("The proposal changed. Review it again before confirming.");
  }
  if (proposal.lineHash && proposal.lineHash !== currentLineHash) {
    throw new AssistantUserError(confirmationDenialMessage("hash"));
  }

  const access = await loadOwnerAccess(input.tenantId, input.actorUserId);
  let canCreate = true;
  let branchInScope = true;
  try {
    assertCanCreateReplenishment(access);
  } catch {
    canCreate = false;
  }
  try {
    resolveScopedBranches([proposal.branchId], access);
  } catch {
    branchInScope = false;
  }

  const row = await prisma.aiReplenishmentConfirmation.findFirst({
    where: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      proposalId: input.proposalId,
      tokenHash: hashConfirmationToken(token),
    },
    select: {
      id: true,
      userId: true,
      proposalId: true,
      lineHash: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  const decision = assessConfirmation({
    row,
    actorUserId: input.actorUserId,
    proposalId: input.proposalId,
    currentLineHash,
    now: input.now ?? new Date(),
    canCreate,
    branchInScope,
    isOwner: proposal.run.automation.ownerUserId === input.actorUserId,
  });
  if (!decision.ok || !row) {
    await logAiAction({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "ai.replenishment.confirm",
      metadata: {
        proposalId: input.proposalId,
        decision: "deny",
        confirmationResult: decision.ok ? "missing" : decision.reason,
      },
    });
    throw new AssistantUserError(confirmationDenialMessage(decision.ok ? "missing" : decision.reason));
  }

  const claimed = await prisma.aiReplenishmentConfirmation.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: input.now ?? new Date() } },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) {
    await logAiAction({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "ai.replenishment.confirm",
      metadata: { proposalId: input.proposalId, decision: "deny", confirmationResult: "used" },
    });
    throw new AssistantUserError(confirmationDenialMessage("used"));
  }

  try {
    const result = await confirmReplenishmentProposal({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      proposalId: input.proposalId,
    });
    await logAiAction({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "ai.replenishment.confirm",
      metadata: {
        proposalId: input.proposalId,
        orderId: result.orderId,
        decision: "allow",
        confirmationResult: result.created ? "created" : "existing",
      },
    });
    return result;
  } catch (error) {
    await logAiAction({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "ai.replenishment.confirm",
      metadata: { proposalId: input.proposalId, decision: "deny", confirmationResult: "failed" },
    });
    if (error instanceof AssistantUserError || error instanceof AutomationAccessError) throw error;
    throw new AssistantUserError("The order could not be confirmed.");
  }
}
