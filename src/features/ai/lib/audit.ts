import { auditService } from "@/features/audit/services/audit.service";

export type AiAuditAction = "ai.copilot.ask" | "ai.briefing.generate";

export async function logAiAction(input: {
  tenantId: string;
  userId: string;
  action: AiAuditAction;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  await auditService.log({
    tenantId: input.tenantId,
    userId: input.userId,
    action: input.action,
    entityType: "AiAssist",
    metadata: input.metadata ?? {},
  });
}
