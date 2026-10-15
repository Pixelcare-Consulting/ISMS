import { NextResponse } from "next/server";

import { requirePixelcareAiApiAccess } from "@/features/pixelcare-ai/lib/access";
import { createConversationSchema } from "@/features/pixelcare-ai/schemas/conversation.schema";
import { conversationService } from "@/features/pixelcare-ai/services/conversation.service";

export async function GET() {
  const access = await requirePixelcareAiApiAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const items = await conversationService.list(
    access.session.user.tenantId,
    access.session.user.id,
  );
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const access = await requirePixelcareAiApiAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = createConversationSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const conversation = await conversationService.create({
    tenantId: access.session.user.tenantId,
    userId: access.session.user.id,
    title: parsed.data.title,
    context: parsed.data.context,
    starterPrompt: parsed.data.starterPrompt,
  });

  return NextResponse.json({ conversation });
}
