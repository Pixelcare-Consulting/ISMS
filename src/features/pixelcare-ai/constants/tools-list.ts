import { PIXELCARE_AI_READ_ONLY_TOOLS } from "@/features/pixelcare-ai/constants/tools";

/** Model-visible tool names. Confirm order is a button, not a model tool. */
export function listPixelcareAiToolNames(): string[] {
  return [...PIXELCARE_AI_READ_ONLY_TOOLS];
}
