import Link from "next/link";
import { notFound } from "next/navigation";

import {
  approvePolicyAction,
  createRevisionAction,
  deletePolicyAction,
  getPolicyAction,
  listPolicyApproversAction,
  revertPolicyToDraftAction,
  submitPolicyForReviewAction,
} from "@/features/policies/actions/policy.actions";
import {
  POLICY_STATUS_LABELS,
  type PolicyStatus,
} from "@/features/policies/constants/policy-status";
import {
  canManagePolicies,
  hasPermission,
  requirePolicyAccess,
} from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { PolicyDetailActions } from "@/app/(app)/policies/_components/policy-detail-actions";
import { PolicyDetailContent } from "@/app/(app)/policies/_components/policy-detail-content";
import { PolicyForm } from "@/app/(app)/policies/_components/policy-form";
import { Badge } from "@/components/ui/badge";

interface PolicyDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PolicyDetailPage({ params }: PolicyDetailPageProps) {
  const { id } = await params;
  const session = await requirePolicyAccess();
  const permissions = session.user.permissions ?? [];
  const canCreate = hasPermission(permissions, "policies.create");
  const canApprove = hasPermission(permissions, "policies.approve");
  const canManage = canManagePolicies(permissions);

  const policy = await getPolicyAction(id);
  if (!policy) {
    notFound();
  }

  const status = policy.status as PolicyStatus;
  const latestVersion = policy.versions[0];
  const content = latestVersion?.content ?? "";

  const approvers = canCreate ? await listPolicyApproversAction() : [];

  const versionRows = policy.versions.map((version) => ({
    id: version.id,
    version: version.version,
    status: version.status,
    content: version.content,
    createdAt: version.createdAt,
    authorName: version.createdBy.name ?? version.createdBy.email,
    attachments: version.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      version: version.version,
    })),
  }));

  const reviewEvents = policy.reviewEvents.map((event) => ({
    id: event.id,
    action: event.action,
    comment: event.comment,
    createdAt: event.createdAt,
    userName: event.user.name ?? event.user.email,
  }));

  const canExportPdf =
    status === "approved" || (canApprove && status === "review");

  return (
    <div className="space-y-6">
      <PageHeader
        title={policy.title}
        description={policy.description ?? "Policy document"}
        actions={
          canManage ? (
            <PolicyDetailActions
              policyId={policy.id}
              status={status}
              canCreate={canCreate}
              canApprove={canApprove}
              approvers={approvers}
              createRevisionAction={createRevisionAction}
              submitForReviewAction={submitPolicyForReviewAction}
              approvePolicyAction={approvePolicyAction}
              revertPolicyToDraftAction={revertPolicyToDraftAction}
              deletePolicyAction={deletePolicyAction}
            />
          ) : null
        }
      />
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge>{POLICY_STATUS_LABELS[status] ?? policy.status}</Badge>
        {latestVersion ? (
          <>
            <span>·</span>
            <span>Version {latestVersion.version}</span>
          </>
        ) : null}
        <span>·</span>
        <span>
          Created by {policy.createdBy.name ?? policy.createdBy.email}
        </span>
        {policy.reviewer ? (
          <>
            <span>·</span>
            <span>
              Reviewer: {policy.reviewer.name ?? policy.reviewer.email}
            </span>
          </>
        ) : null}
        {policy.approvedAt ? (
          <>
            <span>·</span>
            <span>
              Approved {new Date(policy.approvedAt).toLocaleDateString()}
            </span>
          </>
        ) : null}
        <span>·</span>
        <Link href="/policies" className="hover:underline">
          Back to policies
        </Link>
      </div>

      {status === "draft" && canCreate ? (
        <PolicyForm
          mode="edit"
          policy={{
            id: policy.id,
            title: policy.title,
            description: policy.description,
            content,
          }}
        />
      ) : (
        <PolicyDetailContent
          policyId={policy.id}
          versions={versionRows}
          reviewEvents={reviewEvents}
          canExportPdf={canExportPdf}
        />
      )}
    </div>
  );
}
