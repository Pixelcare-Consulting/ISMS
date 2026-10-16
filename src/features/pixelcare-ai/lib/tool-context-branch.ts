import { pixelcareAiContextSchema } from "@/features/pixelcare-ai/schemas/context.schema";
import type { PixelcareAiContext } from "@/features/pixelcare-ai/schemas/context.schema";

const BRANCH_SCOPED_TOOLS = new Set([
  "checkBranchStock",
  "explainShelfGaps",
  "findOrderStatus",
  "findReturnStatus",
]);

/**
 * Pull a single concrete branch id from a successful tool payload.
 * Used only for conversation context sync — never from free-text model output.
 */
export function extractBranchIdFromToolResult(
  toolName: string,
  output: unknown,
): string | null {
  if (!BRANCH_SCOPED_TOOLS.has(toolName)) return null;
  if (!output || typeof output !== "object") return null;

  const payload = output as Record<string, unknown>;
  if (typeof payload.error === "string") return null;
  if (payload.truncated === true) return null;

  if (toolName === "checkBranchStock" || toolName === "explainShelfGaps") {
    const branch = payload.branch;
    if (!branch || typeof branch !== "object") return null;
    const id = (branch as { id?: unknown }).id;
    return typeof id === "string" && id.length > 0 ? id : null;
  }

  if (toolName === "findOrderStatus" || toolName === "findReturnStatus") {
    const rows =
      toolName === "findOrderStatus" ? payload.orders : payload.returns;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const ids = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const branchId = (row as { branchId?: unknown }).branchId;
      if (typeof branchId === "string" && branchId.length > 0) {
        ids.add(branchId);
      }
    }
    // Ambiguous multi-branch results must not overwrite context.
    if (ids.size !== 1) return null;
    return [...ids][0] ?? null;
  }

  return null;
}

export function parseConversationContext(value: unknown): PixelcareAiContext | null {
  if (value == null) return null;
  const parsed = pixelcareAiContextSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
