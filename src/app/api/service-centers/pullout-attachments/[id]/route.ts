import { NextResponse } from "next/server";

import { INVENTORY_APPROVAL_VIEW } from "@/features/inventory-approvals/constants/inventory-approval-display";
import { canAccessScLogistics } from "@/features/service-center-ops/constants/sc-permissions";
import { scPulloutPostingService } from "@/features/service-center-ops/services/sc-pullout-posting.service";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/auth/permissions";
import { toAppSession } from "@/lib/auth/session";
import { getObjectStorage } from "@/lib/storage";
import { inlineContentDisposition } from "@/lib/storage/document-attachment-rules";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Serves an SC pull-out attachment to anyone in this tenant who can open SC pull-outs or their approval trail. */
export async function GET(_request: Request, context: RouteContext) {
  const session = toAppSession(await auth());
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { permissions } = session.user;
  if (!canAccessScLogistics(permissions) && !hasPermission(permissions, INVENTORY_APPROVAL_VIEW)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { id } = await context.params;
  const attachment = await scPulloutPostingService.getAttachment(session.user.tenantId, id);
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
