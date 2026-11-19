import { NextResponse } from "next/server";

import { findViewableOrderAttachmentFile } from "@/features/orders/services/order-history-detail";
import { auth } from "@/lib/auth";
import { toAppSession } from "@/lib/auth/session";
import { getObjectStorage } from "@/lib/storage";
import { inlineContentDisposition } from "@/lib/storage/document-attachment-rules";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Serves one file from the paths saved on the order. */
export async function GET(request: Request, context: RouteContext) {
  const session = toAppSession(await auth());
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await context.params;
  const indexRaw = new URL(request.url).searchParams.get("index");
  const index = indexRaw == null ? Number.NaN : Number.parseInt(indexRaw, 10);
  const file = await findViewableOrderAttachmentFile(
    {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      permissions: session.user.permissions,
      roleSlugs: session.user.roleSlugs ?? [],
    },
    id,
    index,
  );
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const { buffer } = await getObjectStorage().download(file.storagePath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": inlineContentDisposition(file.fileName),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
}
