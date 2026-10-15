import { PIXELCARE_AI_READ_ONLY_TOOLS } from "@/features/pixelcare-ai/constants/tools";

/** Allowlisted tool names (v1). Keep in sync with `buildPixelcareAiTools` keys. */
export function listPixelcareAiToolNames(): string[] {
  return [...PIXELCARE_AI_READ_ONLY_TOOLS];
}
