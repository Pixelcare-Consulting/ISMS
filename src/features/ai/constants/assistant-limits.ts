/**
 * Code ceilings for the tenant assistant policy. Company admins may store a
 * lower number. They cannot raise a limit past these values.
 */
export const AI_ASSISTANT_CEILINGS = {
  maxRequestsPerUser: 30,
  windowSeconds: 600,
  maxOutputTokens: 2048,
  maxToolSteps: 5,
  requestTimeoutMs: 60_000,
  /** Tenant-wide requests in the same window as the per-user cap. */
  maxRequestsPerTenant: 300,
  maxUserConcurrency: 2,
  maxTenantConcurrency: 20,
  maxContextMessages: 24,
} as const;

export const AI_ASSISTANT_LIMIT_FLOORS = {
  maxRequestsPerUser: 1,
  windowSeconds: 60,
  maxOutputTokens: 128,
  maxToolSteps: 1,
  requestTimeoutMs: 5_000,
  maxRequestsPerTenant: 1,
  maxUserConcurrency: 1,
  maxTenantConcurrency: 1,
  maxContextMessages: 1,
} as const;

/** How long a Confirm order token stays usable. */
export const AI_CONFIRMATION_TTL_MS = 15 * 60 * 1000;

export const AI_PROVIDER_PAYLOAD_MAX_CHARS = 8_000;

export type AiAssistantLimitField = keyof typeof AI_ASSISTANT_CEILINGS;

export type AiAssistantLimits = {
  [Key in AiAssistantLimitField]: number;
};

export const AI_ASSISTANT_OFF_MESSAGE =
  "The assistant is turned off for this company. A company admin can turn it on in Company settings.";

export const AI_ASSISTANT_UNAVAILABLE_MESSAGE =
  "The assistant cannot take questions right now.";

export const AI_ASSISTANT_DENIED_MESSAGE = "You do not have access to the assistant.";

/** Missing or disabled is turned off. A failed policy read is unavailable. */
export function messageForAssistantGate(reason: "missing" | "disabled" | "unreadable"): {
  status: 403 | 503;
  error: string;
} {
  switch (reason) {
    case "missing":
    case "disabled":
      return { status: 403, error: AI_ASSISTANT_OFF_MESSAGE };
    case "unreadable":
      return { status: 503, error: AI_ASSISTANT_UNAVAILABLE_MESSAGE };
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

export const AI_ASSISTANT_RATE_LIMIT_MESSAGE =
  "Too many assistant requests. Wait a few minutes, then try again.";

export const AI_ASSISTANT_BUSY_MESSAGE =
  "The assistant is already working on other requests. Wait a moment, then try again.";

export const AI_ASSISTANT_FAILED_MESSAGE =
  "The assistant could not complete that request.";
