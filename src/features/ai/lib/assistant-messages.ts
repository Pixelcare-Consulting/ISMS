import { createHash, randomBytes } from "node:crypto";

export class AssistantUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantUserError";
  }
}

export function publicAssistantError(error: unknown, fallback: string): string {
  if (error instanceof AssistantUserError && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

/** User and retrieved text stay outside the system prompt. */
export function wrapUntrusted(kind: "user" | "assistant" | "page-context" | "retrieved", text: string): string {
  const body = text.replaceAll("</untrusted>", "< /untrusted>");
  return `<untrusted ${kind}>\n${body}\n</untrusted>`;
}

export function hashConfirmationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createConfirmationToken(): string {
  return randomBytes(32).toString("hex");
}
