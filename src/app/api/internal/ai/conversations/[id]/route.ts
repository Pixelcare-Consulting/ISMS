import { NextResponse } from "next/server";

import { requirePixelcareAiApiAccess } from "@/features/pixelcare-ai/lib/access";
import { patchConversationSchema } from "@/features/pixelcare-ai/schemas/conversation.schema";
import { conversationService } from "@/features/pixelcare-ai/services/conversation.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const access = await requirePixelcareAiApiAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const conversation = await conversationService.getOwned(
    access.session.user.tenantId,
    access.session.user.id,
    id,
  );
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  return NextResponse.json({ conversation });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const access = await requirePixelcareAiApiAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = patchConversationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  try {
    const conversation = await conversationService.patch({
      tenantId: access.session.user.tenantId,
      userId: access.session.user.id,
      id,
      title: parsed.data.title,
      context: parsed.data.context,
      pinned: parsed.data.pinned,
    });
    return NextResponse.json({ conversation });
  } catch (error) {
    const missing = error instanceof Error && error.message.includes("not found");
    return NextResponse.json(
      { error: missing ? "Conversation not found." : "Update failed." },
      { status: missing ? 404 : 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const access = await requirePixelcareAiApiAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  try {
    await conversationService.softDelete(
      access.session.user.tenantId,
      access.session.user.id,
      id,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const missing = error instanceof Error && error.message.includes("not found");
    return NextResponse.json(
      { error: missing ? "Conversation not found." : "Delete failed." },
      { status: missing ? 404 : 500 },
    );
  }
}
