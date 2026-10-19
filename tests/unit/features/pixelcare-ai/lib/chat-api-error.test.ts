import {
  AI_ASSISTANT_DENIED_MESSAGE,
  AI_ASSISTANT_FAILED_MESSAGE,
  AI_ASSISTANT_OFF_MESSAGE,
  AI_ASSISTANT_RATE_LIMIT_MESSAGE,
  AI_ASSISTANT_UNAVAILABLE_MESSAGE,
  messageForAssistantGate,
} from "@/features/ai/constants/assistant-limits";
import { formatAssistantApiError } from "@/features/pixelcare-ai/lib/chat-api-error";

describe("formatAssistantApiError", () => {
  it("shows the sentence inside an API error JSON body", () => {
    const raw =
      '{"error":"The assistant is unavailable right now. Try again in a few minutes."}';
    expect(formatAssistantApiError(raw)).toBe(AI_ASSISTANT_UNAVAILABLE_MESSAGE);
    expect(formatAssistantApiError(raw)).not.toContain("{");
  });

  it("keeps turned-off, rate-limit, and provider sentences", () => {
    expect(formatAssistantApiError(JSON.stringify({ error: AI_ASSISTANT_OFF_MESSAGE }))).toBe(
      AI_ASSISTANT_OFF_MESSAGE,
    );
    expect(
      formatAssistantApiError(JSON.stringify({ error: AI_ASSISTANT_RATE_LIMIT_MESSAGE })),
    ).toBe(AI_ASSISTANT_RATE_LIMIT_MESSAGE);
    expect(formatAssistantApiError(JSON.stringify({ error: "AI provider not configured." }))).toBe(
      "AI provider not configured.",
    );
    expect(
      formatAssistantApiError(JSON.stringify({ error: "The assistant is not connected yet." })),
    ).toBe("The assistant is not connected yet.");
  });

  it("hides allowlist and database internals", () => {
    expect(
      formatAssistantApiError(
        JSON.stringify({ error: "Clear PIXELCARE_AI_USER_IDS or add your user id." }),
      ),
    ).toBe(AI_ASSISTANT_DENIED_MESSAGE);
    expect(
      formatAssistantApiError(
        '{"error":"PrismaClientKnownRequestError: relation ai_assistant_policies does not exist"}',
      ),
    ).toBe(AI_ASSISTANT_UNAVAILABLE_MESSAGE);
  });

  it("does not show a JSON body that has no sentence", () => {
    expect(formatAssistantApiError('{"ok":false}')).toBe(AI_ASSISTANT_FAILED_MESSAGE);
    expect(formatAssistantApiError("")).toBeNull();
  });
});

describe("messageForAssistantGate", () => {
  it("says turned off when the row is missing or disabled", () => {
    expect(messageForAssistantGate("missing")).toEqual({
      status: 403,
      error: AI_ASSISTANT_OFF_MESSAGE,
    });
    expect(messageForAssistantGate("disabled")).toEqual({
      status: 403,
      error: AI_ASSISTANT_OFF_MESSAGE,
    });
  });

  it("says the assistant cannot take questions when the policy cannot be read", () => {
    expect(messageForAssistantGate("unreadable")).toEqual({
      status: 503,
      error: AI_ASSISTANT_UNAVAILABLE_MESSAGE,
    });
  });
});
