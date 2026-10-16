export const PIXELCARE_AI_LIMITS = {
  maxMessageChars: 4000,
  maxContextMessages: 24,
  maxOutputTokens: 2048,
  maxToolSteps: 5,
  requestTimeoutMs: 60_000,
  rateLimitMax: 30,
  rateLimitWindowSec: 600,
  maxToolResultItems: 25,
  /** Bounded AOR branch list for listPermittedBranches. */
  maxListBranches: 50,
  maxTitleChars: 80,
  maxToolPayloadChars: 4000,
} as const;
