import { NextResponse } from "next/server";

import { canAccessLogistics } from "@/features/logistics/constants/logistics-permissions";
import { pulloutPostingService } from "@/features/logistics/services/pullout-posting.service";
import { auth } from "@/lib/auth";
import { toAppSession } from "@/lib/auth/session";
import { getObjectStorage } from "@/lib/storage";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Serves a pull-out attachment to anyone who can open pull-outs in this tenant. */
export async function GET(_request: Request, context: RouteContext) {
  const session = toAppSession(await auth());
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!canAccessLogistics(session.user.permissions)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { id } = await context.params;
  const attachment = await pulloutPostingService.getAttachment(session.user.tenantId, id);
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const { buffer } = await getObjectStorage().download(attachment.storagePath);
    const encodedName = encodeURIComponent(attachment.fileName).replace(/['()*]/g, escape);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
}
