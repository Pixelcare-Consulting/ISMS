import type { ToolSet } from "ai";

import { PIXELCARE_AI_LIMITS } from "@/features/pixelcare-ai/constants/limits";
import { PIXELCARE_AI_READ_ONLY_TOOLS } from "@/features/pixelcare-ai/constants/tools";
import { AI_ASSISTANT_OFF_MESSAGE } from "@/features/ai/constants/assistant-limits";
import { logAiAction } from "@/features/ai/lib/audit";
import { capProviderJson } from "@/features/ai/lib/provider-payload";
import { readAiAssistantGate } from "@/features/ai/services/assistant-policy.service";
import { loadOwnerAccess } from "@/features/pixelcare-ai/automations/owner-access";
import type { AppSession } from "@/lib/auth/session";

const READ_ONLY = new Set<string>(PIXELCARE_AI_READ_ONLY_TOOLS);

type ToolExecute = (
  input: unknown,
  options: { abortSignal?: AbortSignal; toolCallId?: string; messages?: unknown[] },
) => Promise<unknown>;

type ToolDefinition = {
  description?: string;
  inputSchema?: unknown;
  execute?: ToolExecute;
};

export type ReadToolGuardOptions = {
  session: AppSession;
  maxToolSteps: number;
  requestTimeoutMs: number;
  abortSignal?: AbortSignal;
};

async function auditTool(input: {
  session: AppSession;
  toolName: string;
  decision: "allow" | "deny";
}): Promise<void> {
  try {
    await logAiAction({
      tenantId: input.session.user.tenantId,
      userId: input.session.user.id,
      action: "ai.pixelcare.tool",
      metadata: { toolName: input.toolName, decision: input.decision },
    });
  } catch {
    // Audit failure must not become a tool result.
  }
}

async function stillPermitted(session: AppSession): Promise<boolean> {
  try {
    const access = await loadOwnerAccess(session.user.tenantId, session.user.id);
    session.user.permissions.splice(0, session.user.permissions.length, ...access.permissions);
    return access.pixelcare;
  } catch {
    return false;
  }
}

/**
 * Copies only registered read tools. Write names and injected names are dropped.
 * Each call rechecks the tenant policy, reloads permissions, and times out.
 */
export function sealPixelcareReadTools(
  tools: object,
  options: ReadToolGuardOptions,
): ToolSet {
  const source = tools as Record<string, ToolDefinition | undefined>;
  const sealed: Record<string, ToolDefinition> = {};
  const steps = { count: 0 };

  for (const name of PIXELCARE_AI_READ_ONLY_TOOLS) {
    const toolDef = source[name];
    if (!toolDef?.execute) continue;
    const execute = toolDef.execute;
    sealed[name] = {
      ...toolDef,
      execute: async (input, execOptions) => {
        if (!READ_ONLY.has(name)) {
          await auditTool({ session: options.session, toolName: name, decision: "deny" });
          return { error: "That action is not available." };
        }
        steps.count += 1;
        if (steps.count > options.maxToolSteps) {
          await auditTool({ session: options.session, toolName: name, decision: "deny" });
          return { error: "The assistant stopped after too many lookups." };
        }

        const policy = await readAiAssistantGate(options.session.user.tenantId);
        if (!policy.ok) {
          await auditTool({ session: options.session, toolName: name, decision: "deny" });
          return { error: AI_ASSISTANT_OFF_MESSAGE };
        }
        const permitted = await stillPermitted(options.session);
        if (!permitted) {
          await auditTool({ session: options.session, toolName: name, decision: "deny" });
          return { error: "You do not have access to that." };
        }

        const timeoutMs = Math.min(options.requestTimeoutMs, policy.limits.requestTimeoutMs);
        const signals = [AbortSignal.timeout(timeoutMs)];
        if (options.abortSignal) signals.push(options.abortSignal);
        if (execOptions?.abortSignal) signals.push(execOptions.abortSignal);
        const signal = AbortSignal.any(signals);

        let timedOut = false;
        const timeout = new Promise<{ error: string }>((resolve) => {
          const timer = setTimeout(() => {
            timedOut = true;
            resolve({ error: "That lookup took too long." });
          }, timeoutMs);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
            },
            { once: true },
          );
        });

        try {
          const result = await Promise.race([
            execute(input, { ...execOptions, abortSignal: signal }),
            timeout,
          ]);
          if (timedOut) {
            await auditTool({ session: options.session, toolName: name, decision: "deny" });
            return { error: "That lookup took too long." };
          }
          await auditTool({ session: options.session, toolName: name, decision: "allow" });
          return capProviderJson(result, PIXELCARE_AI_LIMITS.maxToolPayloadChars);
        } catch {
          await auditTool({ session: options.session, toolName: name, decision: "deny" });
          return { error: "That lookup could not be completed." };
        }
      },
    };
  }

  return sealed as ToolSet;
}

export function isRegisteredReadTool(
  name: string,
): name is (typeof PIXELCARE_AI_READ_ONLY_TOOLS)[number] {
  return READ_ONLY.has(name);
}
