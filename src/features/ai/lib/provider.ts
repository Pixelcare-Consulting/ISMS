import { openai } from "@ai-sdk/openai";

const DEFAULT_MODEL = "gpt-4o-mini";

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getAiModel() {
  if (!isAiConfigured()) {
    throw new Error("ISMS Assist is not configured");
  }

  const modelId = process.env.AI_MODEL?.trim() || DEFAULT_MODEL;
  return openai(modelId);
}
