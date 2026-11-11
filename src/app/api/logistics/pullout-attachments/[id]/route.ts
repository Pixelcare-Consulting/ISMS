import { NextResponse } from "next/server";

import { INVENTORY_APPROVAL_VIEW } from "@/features/inventory-approvals/constants/inventory-approval-display";
import { canViewPullouts } from "@/features/logistics/constants/logistics-permissions";
import { pulloutPostingService } from "@/features/logistics/services/pullout-posting.service";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/auth/permissions";
import { toAppSession } from "@/lib/auth/session";
import { getObjectStorage } from "@/lib/storage";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Serves a pull-out attachment to anyone in this tenant who can open pull-outs or their approval trail. */
export async function GET(_request: Request, context: RouteContext) {
  const session = toAppSession(await auth());
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { permissions } = session.user;
  if (!canViewPullouts(permissions) && !hasPermission(permissions, INVENTORY_APPROVAL_VIEW)) {
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
