import type { LanguageModel } from "ai";

import { createQwenProvider } from "@/features/pixelcare-ai/lib/qwen-provider";

export interface AiProviderAdapter {
  id: string;
  isConfigured(): boolean;
  getLanguageModel(): LanguageModel;
}

const PROVIDER_NOT_CONFIGURED = "AI provider not configured.";

export function getPixelcareAiProvider(id: "qwen" = "qwen"): AiProviderAdapter {
  switch (id) {
    case "qwen":
      return createQwenProvider();
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function isPixelcareAiProviderConfigured(): boolean {
  return getPixelcareAiProvider().isConfigured();
}

export function getPixelcareAiLanguageModel(): LanguageModel {
  const provider = getPixelcareAiProvider();
  if (!provider.isConfigured()) {
    throw new Error(PROVIDER_NOT_CONFIGURED);
  }
  return provider.getLanguageModel();
}

export { PROVIDER_NOT_CONFIGURED };
