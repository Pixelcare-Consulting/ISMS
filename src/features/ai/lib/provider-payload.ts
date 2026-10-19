import { AI_PROVIDER_PAYLOAD_MAX_CHARS } from "@/features/ai/constants/assistant-limits";
import { sanitizeMarkdownHref } from "@/features/pixelcare-ai/lib/sanitize-markdown-href";

const SENSITIVE_KEY =
  /(customer.?name|e-?mail|phone|mobile|address|password|secret|token|api.?key|credential|authorization|cookie|session|line.?hash)/i;

const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SECRET_VALUE = /^(bearer\s+\S+|sk-[a-z0-9]|qwen-|eyJ[a-z0-9_-]{8,})/i;

const HREF_KEYS = new Set(["href", "sourcehref", "url"]);

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

function redactString(key: string, value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (EMAIL_VALUE.test(trimmed) || SECRET_VALUE.test(trimmed)) return undefined;
  if (HREF_KEYS.has(key.toLowerCase())) {
    return sanitizeMarkdownHref(trimmed);
  }
  return value;
}

/**
 * Keeps operational tool fields and drops credentials, contact details, and
 * customer names before anything is sent to a provider.
 */
export function allowlistProviderValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return undefined;
  if (value == null) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactString("", value);
  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => allowlistProviderValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== "object") return undefined;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) continue;
    if (typeof child === "string") {
      const redacted = redactString(key, child);
      if (redacted === undefined) continue;
      output[key] = redacted;
      continue;
    }
    const next = allowlistProviderValue(child, depth + 1);
    if (next !== undefined) output[key] = next;
  }
  return output;
}

export function capProviderJson(value: unknown, maxChars = AI_PROVIDER_PAYLOAD_MAX_CHARS): unknown {
  const allowed = allowlistProviderValue(value);
  const raw = JSON.stringify(allowed);
  if (raw.length <= maxChars) return allowed;
  return {
    truncated: true,
    note: "Result was too large to include.",
  };
}

export function providerJson(value: unknown, maxChars = AI_PROVIDER_PAYLOAD_MAX_CHARS): string {
  return JSON.stringify(capProviderJson(value, maxChars));
}
