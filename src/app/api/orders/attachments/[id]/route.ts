import { NextResponse } from "next/server";

import { findViewableOrderAttachment } from "@/features/orders/services/order-history-detail";
import { auth } from "@/lib/auth";
import { toAppSession } from "@/lib/auth/session";
import { getObjectStorage } from "@/lib/storage";
import { inlineContentDisposition } from "@/lib/storage/document-attachment-rules";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Serves an order attachment to anyone in this tenant who can open that order. */
export async function GET(_request: Request, context: RouteContext) {
  const session = toAppSession(await auth());
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await context.params;
  const attachment = await findViewableOrderAttachment(
    {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      permissions: session.user.permissions,
      roleSlugs: session.user.roleSlugs,
    },
    id,
  );
  // Same answer for missing and out of scope, so ids cannot be probed.
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const { buffer } = await getObjectStorage().download(attachment.storagePath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": inlineContentDisposition(attachment.fileName),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
}
