import {
  AI_ASSISTANT_BUSY_MESSAGE,
  AI_ASSISTANT_DENIED_MESSAGE,
  AI_ASSISTANT_FAILED_MESSAGE,
  AI_ASSISTANT_OFF_MESSAGE,
  AI_ASSISTANT_RATE_LIMIT_MESSAGE,
  AI_ASSISTANT_UNAVAILABLE_MESSAGE,
} from "@/features/ai/constants/assistant-limits";

const PROVIDER_MESSAGE = "The assistant is not connected yet.";

const SAFE_SENTENCES = new Set<string>([
  AI_ASSISTANT_OFF_MESSAGE,
  AI_ASSISTANT_UNAVAILABLE_MESSAGE,
  AI_ASSISTANT_DENIED_MESSAGE,
  AI_ASSISTANT_RATE_LIMIT_MESSAGE,
  AI_ASSISTANT_BUSY_MESSAGE,
  AI_ASSISTANT_FAILED_MESSAGE,
  PROVIDER_MESSAGE,
  "AI provider not configured.",
  "Authentication required.",
  "Message is required.",
  "Conversation not found.",
  "Invalid JSON body.",
  "Invalid chat request.",
  "Ask a short question to continue.",
  "You do not have access to ISMS Assist.",
  "The assistant is unavailable right now. Try again in a few minutes.",
]);

/**
 * Chat transport stores the HTTP body on Error.message. Show the sentence
 * inside `{ "error": "..." }` and keep permission, policy, rate-limit, and
 * provider text short.
 */
export function formatAssistantApiError(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const sentence = unwrapErrorSentence(trimmed);
  if (!sentence) return AI_ASSISTANT_FAILED_MESSAGE;
  return presentAssistantError(sentence);
}

function unwrapErrorSentence(raw: string): string {
  let current = raw.trim();
  for (let depth = 0; depth < 3; depth += 1) {
    if (!current.startsWith("{")) return current;
    let value: unknown;
    try {
      value = JSON.parse(current);
    } catch {
      return "";
    }
    if (!value || typeof value !== "object" || Array.isArray(value) || !("error" in value)) {
      return "";
    }
    const error = (value as { error: unknown }).error;
    if (typeof error !== "string" || !error.trim()) return "";
    current = error.trim();
  }
  if (current.startsWith("{")) return "";
  return current;
}

function presentAssistantError(message: string): string {
  if (message === "The assistant is unavailable right now. Try again in a few minutes.") {
    return AI_ASSISTANT_UNAVAILABLE_MESSAGE;
  }
  if (SAFE_SENTENCES.has(message)) return message;
  if (/^Message exceeds \d+ characters\.$/.test(message)) return message;

  if (/allowlist|PIXELCARE_AI_|do not have access|Authentication required/i.test(message)) {
    return AI_ASSISTANT_DENIED_MESSAGE;
  }
  if (/not configured|not connected|provider/i.test(message)) return PROVIDER_MESSAGE;
  if (/too many assistant requests|rate limit/i.test(message)) {
    return AI_ASSISTANT_RATE_LIMIT_MESSAGE;
  }
  if (/turned off/i.test(message)) return AI_ASSISTANT_OFF_MESSAGE;
  if (/prisma|UPSTASH|\bredis\b|ECONN|process\.env|\bSQL\b| at \S+\(/i.test(message)) {
    return AI_ASSISTANT_UNAVAILABLE_MESSAGE;
  }
  if (message.length > 240 || message.includes("\n") || message.startsWith("{")) {
    return AI_ASSISTANT_FAILED_MESSAGE;
  }
  return message;
}
