import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";

import { PolicyPdfDocument } from "@/features/policies/components/policy-pdf-document";
import { policyService } from "@/features/policies/services/policy.service";
import {
  canManagePolicies,
  canViewPolicy,
} from "@/lib/auth/permissions";
import { auth } from "@/lib/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

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

  if (canManage && policy.status === "draft") {
    return NextResponse.json(
      { error: "PDF export is available for in-review and approved policies" },
      { status: 400 },
    );
  }

  const latestVersion = policy.versions[0];
  if (!latestVersion) {
    return NextResponse.json({ error: "No version found" }, { status: 404 });
  }

  const attachment = latestVersion.attachments[0];
  const attachmentNote = attachment
    ? `An attachment (${attachment.fileName}) is stored separately. Download it from the policy detail page.`
    : null;

  const buffer = await renderToBuffer(
    <PolicyPdfDocument
      title={policy.title}
      description={policy.description}
      status={policy.status}
      version={latestVersion.version}
      approvedAt={policy.approvedAt}
      authorName={policy.createdBy.name ?? policy.createdBy.email}
      content={latestVersion.content}
      attachmentNote={attachmentNote}
    />,
  );

  const safeTitle = policy.title.replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 60);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeTitle}-v${latestVersion.version}.pdf"`,
    },
  });
}
