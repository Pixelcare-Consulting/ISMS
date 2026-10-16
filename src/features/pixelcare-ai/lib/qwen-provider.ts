import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import type { AiProviderAdapter } from "@/features/pixelcare-ai/lib/provider";

const DEFAULT_MODEL = "qwen-plus";
const DEFAULT_BASE_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

function readQwenEnv() {
  return {
    apiKey: process.env.QWEN_API_KEY?.trim() ?? "",
    baseURL: process.env.QWEN_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: process.env.QWEN_MODEL?.trim() || DEFAULT_MODEL,
  };
}

export function createQwenProvider(): AiProviderAdapter {
  return {
    id: "qwen",
    isConfigured() {
      return Boolean(readQwenEnv().apiKey);
    },
    getLanguageModel(): LanguageModel {
      const { apiKey, baseURL, model } = readQwenEnv();
      if (!apiKey) {
        throw new Error("AI provider not configured.");
      }
      const qwen = createOpenAI({
        apiKey,
        baseURL,
        name: "qwen",
      });
      return qwen.chat(model);
    },
  };
}
