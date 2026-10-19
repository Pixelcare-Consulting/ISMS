import { NextResponse } from "next/server";

import { AI_ASSISTANT_FAILED_MESSAGE } from "@/features/ai/constants/assistant-limits";
import { AssistantUserError } from "@/features/ai/lib/assistant-messages";
import { requirePixelcareAiApiAccess } from "@/features/pixelcare-ai/lib/access";
import { chatRequestSchema } from "@/features/pixelcare-ai/schemas/conversation.schema";
import { streamPixelcareAiChat } from "@/features/pixelcare-ai/services/chat.service";

export const maxDuration = 60;

export async function POST(request: Request) {
  const access = await requirePixelcareAiApiAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid chat request." },
      { status: 400 },
    );
  }

  try {
    const streamed = await streamPixelcareAiChat({
      session: access.session,
      conversationId: parsed.data.conversationId,
      messages: parsed.data.messages as never,
      message: parsed.data.message,
      context: parsed.data.context,
      abortSignal: request.signal,
    });

    if (!streamed.ok) {
      return NextResponse.json({ error: streamed.error }, { status: streamed.status });
    }

    return streamed.response;
  } catch (error) {
    if (error instanceof AssistantUserError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Conversation not found")) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }
    if (message.includes("not configured")) {
      return NextResponse.json({ error: "The assistant is not connected yet." }, { status: 503 });
    }
    return NextResponse.json({ error: AI_ASSISTANT_FAILED_MESSAGE }, { status: 500 });
  }
}
