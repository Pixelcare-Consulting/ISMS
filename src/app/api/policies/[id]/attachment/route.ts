import { NextResponse } from "next/server";

import { policyService } from "@/features/policies/services/policy.service";
import {
  canManagePolicies,
  canViewPolicy,
} from "@/lib/auth/permissions";
import { auth } from "@/lib/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const attachmentId = searchParams.get("attachmentId");

  if (!attachmentId) {
    return NextResponse.json({ error: "attachmentId required" }, { status: 400 });
  }

  const policy = await policyService.getPolicy(session.user.tenantId, id);
  if (!policy) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canViewPolicy(policy, session.user.permissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const canManage = canManagePolicies(session.user.permissions);
  if (!canManage && policy.status !== "approved") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const file = await policyService.getAttachmentDownload(
      session.user.tenantId,
      id,
      attachmentId,
    );

    // RFC 5987 encoding prevents header injection/corruption from quotes or
    // CRLF in the stored filename.
    const encodedName = encodeURIComponent(file.fileName).replace(/['()*]/g, escape);
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Download failed" },
      { status: 404 },
    );
  }
}
