import { NextResponse } from "next/server";

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
    const message = error instanceof Error ? error.message : "Pixelcare AI chat failed.";
    if (message.includes("Conversation not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("not configured")) {
      return NextResponse.json({ error: "AI provider not configured." }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
