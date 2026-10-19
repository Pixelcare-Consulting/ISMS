import { PIXELCARE_AI_LIMITS } from "@/features/pixelcare-ai/constants/limits";

export function retrievedAt() {
  return new Date().toISOString();
}

export function truncatePayload<T>(value: T): T {
  const raw = JSON.stringify(value);
  if (raw.length <= PIXELCARE_AI_LIMITS.maxToolPayloadChars) return value;
  return {
    truncated: true,
    note: "Result was too large to include.",
  } as T;
}
