import {
  PIXELCARE_AI_CONFIRMED_WRITE_TOOLS,
  PIXELCARE_AI_READ_ONLY_TOOLS,
} from "@/features/pixelcare-ai/constants/tools";

/** Allowlisted tool names. Keep in sync with `buildPixelcareAiTools` keys. */
export function listPixelcareAiToolNames(): string[] {
  return [...PIXELCARE_AI_READ_ONLY_TOOLS, ...PIXELCARE_AI_CONFIRMED_WRITE_TOOLS];
}
