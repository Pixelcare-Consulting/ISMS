import { z } from "zod";

import {
  AI_ASSISTANT_CEILINGS,
  AI_ASSISTANT_LIMIT_FLOORS,
  type AiAssistantLimitField,
  type AiAssistantLimits,
} from "@/features/ai/constants/assistant-limits";
import { prisma } from "@/lib/database/client";

export type AiPolicyGate =
  | { ok: true; limits: AiAssistantLimits }
  | { ok: false; reason: "missing" | "disabled" | "unreadable" };

const LIMIT_FIELDS = Object.keys(AI_ASSISTANT_CEILINGS) as AiAssistantLimitField[];

function clampLimit(field: AiAssistantLimitField, value: number): number {
  const ceiling = AI_ASSISTANT_CEILINGS[field];
  const floor = AI_ASSISTANT_LIMIT_FLOORS[field];
  if (!Number.isInteger(value)) return ceiling;
  return Math.min(ceiling, Math.max(floor, value));
}

export function clampAiAssistantLimits(
  input: Partial<Record<AiAssistantLimitField, number>> | null | undefined,
): AiAssistantLimits {
  const limits = {} as AiAssistantLimits;
  for (const field of LIMIT_FIELDS) {
    const raw = input?.[field];
    limits[field] = clampLimit(field, typeof raw === "number" ? raw : AI_ASSISTANT_CEILINGS[field]);
  }
  return limits;
}

function limitSchema(field: AiAssistantLimitField) {
  return z
    .number()
    .int()
    .min(AI_ASSISTANT_LIMIT_FLOORS[field])
    .max(AI_ASSISTANT_CEILINGS[field]);
}

export const aiAssistantPolicyInputSchema = z.object({
  enabled: z.boolean(),
  maxRequestsPerUser: limitSchema("maxRequestsPerUser"),
  windowSeconds: limitSchema("windowSeconds"),
  maxOutputTokens: limitSchema("maxOutputTokens"),
  maxToolSteps: limitSchema("maxToolSteps"),
  requestTimeoutMs: limitSchema("requestTimeoutMs"),
  maxRequestsPerTenant: limitSchema("maxRequestsPerTenant"),
  maxUserConcurrency: limitSchema("maxUserConcurrency"),
  maxTenantConcurrency: limitSchema("maxTenantConcurrency"),
  maxContextMessages: limitSchema("maxContextMessages"),
});

export type AiAssistantPolicyInput = z.infer<typeof aiAssistantPolicyInputSchema>;

export function defaultAiAssistantPolicyInput(): AiAssistantPolicyInput {
  return {
    enabled: false,
    ...clampAiAssistantLimits(null),
  };
}

/**
 * No row, enabled false, or a failed read means the assistant is off.
 * Sample mode does not bypass this.
 */
export async function readAiAssistantGate(tenantId: string): Promise<AiPolicyGate> {
  try {
    const row = await prisma.aiAssistantPolicy.findUnique({
      where: { tenantId },
    });
    if (!row) return { ok: false, reason: "missing" };
    if (!row.enabled) return { ok: false, reason: "disabled" };
    return { ok: true, limits: clampAiAssistantLimits(row) };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}

export async function readAiAssistantPolicyForm(
  tenantId: string,
): Promise<AiAssistantPolicyInput> {
  try {
    const row = await prisma.aiAssistantPolicy.findUnique({
      where: { tenantId },
    });
    if (!row) return defaultAiAssistantPolicyInput();
    return {
      enabled: row.enabled,
      ...clampAiAssistantLimits(row),
    };
  } catch {
    return defaultAiAssistantPolicyInput();
  }
}

export async function saveAiAssistantPolicy(
  tenantId: string,
  input: AiAssistantPolicyInput,
): Promise<void> {
  const limits = clampAiAssistantLimits(input);
  await prisma.aiAssistantPolicy.upsert({
    where: { tenantId },
    create: {
      tenantId,
      enabled: input.enabled,
      ...limits,
    },
    update: {
      enabled: input.enabled,
      ...limits,
    },
  });
}
