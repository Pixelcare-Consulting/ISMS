import { auditService } from "@/features/audit/services/audit.service";
import type { PolicyStatus } from "@/features/policies/constants/policy-status";
import { policyRepository } from "@/features/policies/repositories/policy.repository";
import {
  createPolicySchema,
  createRevisionSchema,
  policyWorkflowCommentSchema,
  POLICY_ATTACHMENT_MAX_BYTES,
  POLICY_ATTACHMENT_MIME_TYPES,
  updatePolicySchema,
} from "@/features/policies/schemas/policy.schema";
import { sendPolicyReviewEmail } from "@/lib/notifications";
import {
  buildPolicyAttachmentPath,
  getSupabaseAdmin,
  POLICY_DOCUMENTS_BUCKET,
} from "@/lib/storage/supabase-server";

function policyUrl(policyId: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/policies/${policyId}`;
}

export const policyService = {
  listPolicies(tenantId: string, approvedOnly = false) {
    return policyRepository.listByTenant(tenantId, approvedOnly);
  },

  getPolicy(tenantId: string, policyId: string) {
    return policyRepository.findById(tenantId, policyId);
  },

  listApprovers(tenantId: string) {
    return policyRepository.listApprovers(tenantId);
  },

  async createPolicy(input: {
    tenantId: string;
    actorUserId: string;
    title: string;
    description?: string;
    content: string;
  }) {
    const parsed = createPolicySchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const policy = await policyRepository.create({
      tenantId: input.tenantId,
      title: parsed.data.title,
      description: parsed.data.description,
      status: "draft",
      createdById: input.actorUserId,
      content: parsed.data.content,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "policy.created",
      entityType: "Policy",
      entityId: policy.id,
      metadata: { title: policy.title, status: policy.status },
    });

    return policy;
  },

  async updatePolicy(input: {
    tenantId: string;
    actorUserId: string;
    policyId: string;
    title: string;
    description?: string;
    content: string;
  }) {
    const parsed = updatePolicySchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await policyRepository.findById(
      input.tenantId,
      parsed.data.policyId,
    );
    if (!existing) {
      throw new Error("Policy not found");
    }
    if (existing.status !== "draft") {
      throw new Error("Only draft policies can be edited");
    }

    const policy = await policyRepository.updatePolicy(
      input.tenantId,
      parsed.data.policyId,
      {
        title: parsed.data.title,
        description: parsed.data.description,
        content: parsed.data.content,
        actorUserId: input.actorUserId,
      },
    );
    if (!policy) {
      throw new Error("Policy not found or not editable");
    }

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "policy.updated",
      entityType: "Policy",
      entityId: policy.id,
      metadata: { title: policy.title },
    });

    return policy;
  },

  async createRevision(input: {
    tenantId: string;
    actorUserId: string;
    policyId: string;
    title?: string;
    description?: string;
    content?: string;
  }) {
    const parsed = createRevisionSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await policyRepository.findById(
      input.tenantId,
      parsed.data.policyId,
    );
    if (!existing) {
      throw new Error("Policy not found");
    }
    if (existing.status !== "approved") {
      throw new Error("Only approved policies can be revised");
    }

    const latestContent = existing.versions[0]?.content ?? "";

    const policy = await policyRepository.createRevision(
      input.tenantId,
      parsed.data.policyId,
      {
        title: parsed.data.title,
        description: parsed.data.description,
        content: parsed.data.content ?? latestContent,
        actorUserId: input.actorUserId,
      },
    );
    if (!policy) {
      throw new Error("Could not create revision");
    }

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "policy.revision_created",
      entityType: "Policy",
      entityId: policy.id,
      metadata: {
        title: policy.title,
        version: policy.versions[0]?.version,
      },
    });

    return policy;
  },

  async submitForReview(input: {
    tenantId: string;
    actorUserId: string;
    actorName: string;
    policyId: string;
    comment?: string;
    reviewerId?: string;
  }) {
    const parsed = policyWorkflowCommentSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await policyRepository.findById(
      input.tenantId,
      parsed.data.policyId,
    );
    if (!existing) {
      throw new Error("Policy not found");
    }
    if (existing.status !== "draft") {
      throw new Error("Only draft policies can be submitted");
    }

    if (parsed.data.reviewerId) {
      const approvers = await policyRepository.listApprovers(input.tenantId);
      if (!approvers.some((user) => user.id === parsed.data.reviewerId)) {
        throw new Error("Selected reviewer is not an approver");
      }
    }

    const policy = await policyRepository.setStatus(
      input.tenantId,
      parsed.data.policyId,
      "review",
      { reviewerId: parsed.data.reviewerId ?? null },
    );
    if (!policy) {
      throw new Error("Policy not found");
    }

    await policyRepository.createReviewEvent({
      policyId: policy.id,
      userId: input.actorUserId,
      action: "submitted",
      comment: parsed.data.comment,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "policy.submitted_for_review",
      entityType: "Policy",
      entityId: policy.id,
      metadata: {
        title: policy.title,
        reviewerId: parsed.data.reviewerId ?? null,
      },
    });

    const approvers = await policyRepository.listApprovers(input.tenantId);
    const recipients = parsed.data.reviewerId
      ? approvers.filter((user) => user.id === parsed.data.reviewerId)
      : approvers;

    await sendPolicyReviewEmail({
      to: recipients.map((user) => user.email),
      event: "submitted",
      policyTitle: policy.title,
      policyUrl: policyUrl(policy.id),
      actorName: input.actorName,
      comment: parsed.data.comment,
    });

    return policy;
  },

  async approvePolicy(input: {
    tenantId: string;
    actorUserId: string;
    actorName: string;
    policyId: string;
    comment?: string;
  }) {
    const parsed = policyWorkflowCommentSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await policyRepository.findById(
      input.tenantId,
      parsed.data.policyId,
    );
    if (!existing) {
      throw new Error("Policy not found");
    }
    if (existing.status !== "review") {
      throw new Error("Policy must be in review");
    }

    const policy = await policyRepository.setStatus(
      input.tenantId,
      parsed.data.policyId,
      "approved",
      { approvedAt: new Date(), reviewerId: null },
    );
    if (!policy) {
      throw new Error("Policy not found");
    }

    await policyRepository.createReviewEvent({
      policyId: policy.id,
      userId: input.actorUserId,
      action: "approved",
      comment: parsed.data.comment,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "policy.approved",
      entityType: "Policy",
      entityId: policy.id,
      metadata: { title: policy.title, status: policy.status },
    });

    await sendPolicyReviewEmail({
      to: [policy.createdBy.email],
      event: "approved",
      policyTitle: policy.title,
      policyUrl: policyUrl(policy.id),
      actorName: input.actorName,
      comment: parsed.data.comment,
    });

    return policy;
  },

  async revertToDraft(input: {
    tenantId: string;
    actorUserId: string;
    actorName: string;
    policyId: string;
    comment?: string;
  }) {
    const parsed = policyWorkflowCommentSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await policyRepository.findById(
      input.tenantId,
      parsed.data.policyId,
    );
    if (!existing) {
      throw new Error("Policy not found");
    }
    if (existing.status !== "review") {
      throw new Error("Only policies in review can be reverted to draft");
    }

    const policy = await policyRepository.setStatus(
      input.tenantId,
      parsed.data.policyId,
      "draft",
      { approvedAt: null, reviewerId: null },
    );
    if (!policy) {
      throw new Error("Policy not found");
    }

    await policyRepository.createReviewEvent({
      policyId: policy.id,
      userId: input.actorUserId,
      action: "reverted",
      comment: parsed.data.comment,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "policy.reverted_to_draft",
      entityType: "Policy",
      entityId: policy.id,
      metadata: { title: policy.title },
    });

    await sendPolicyReviewEmail({
      to: [policy.createdBy.email],
      event: "reverted",
      policyTitle: policy.title,
      policyUrl: policyUrl(policy.id),
      actorName: input.actorName,
      comment: parsed.data.comment,
    });

    return policy;
  },

  async deletePolicy(input: {
    tenantId: string;
    actorUserId: string;
    policyId: string;
  }) {
    const existing = await policyRepository.findById(
      input.tenantId,
      input.policyId,
    );
    if (!existing) {
      throw new Error("Policy not found");
    }
    if (existing.status === "approved") {
      throw new Error("Approved policies cannot be deleted");
    }

    await policyRepository.softDelete(input.tenantId, input.policyId);

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "policy.deleted",
      entityType: "Policy",
      entityId: existing.id,
      metadata: { title: existing.title },
    });
  },

  async uploadAttachment(input: {
    tenantId: string;
    actorUserId: string;
    policyId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    fileBuffer: Buffer;
  }) {
    if (
      !POLICY_ATTACHMENT_MIME_TYPES.includes(
        input.mimeType as (typeof POLICY_ATTACHMENT_MIME_TYPES)[number],
      )
    ) {
      throw new Error("File type not allowed. Use PDF, DOCX, or PNG.");
    }

    if (input.sizeBytes > POLICY_ATTACHMENT_MAX_BYTES) {
      throw new Error("File exceeds 10 MB limit.");
    }

    const policy = await policyRepository.findById(input.tenantId, input.policyId);
    if (!policy) {
      throw new Error("Policy not found");
    }
    if (policy.status !== "draft") {
      throw new Error("Attachments can only be added to draft policies");
    }

    const latestVersion = policy.versions[0];
    if (!latestVersion) {
      throw new Error("Policy version not found");
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      throw new Error(
        "File storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      );
    }

    const fileId = crypto.randomUUID();
    const storagePath = buildPolicyAttachmentPath({
      tenantId: input.tenantId,
      policyId: input.policyId,
      version: latestVersion.version,
      fileName: input.fileName,
      fileId,
    });

    const { error } = await supabase.storage
      .from(POLICY_DOCUMENTS_BUCKET)
      .upload(storagePath, input.fileBuffer, {
        contentType: input.mimeType,
        upsert: false,
      });

    if (error) {
      throw new Error(error.message);
    }

    const attachment = await policyRepository.createAttachment({
      policyVersionId: latestVersion.id,
      fileName: input.fileName,
      storagePath,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedById: input.actorUserId,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "policy.attachment_uploaded",
      entityType: "Policy",
      entityId: policy.id,
      metadata: { fileName: input.fileName, version: latestVersion.version },
    });

    return attachment;
  },

  async getAttachmentDownload(
    tenantId: string,
    policyId: string,
    attachmentId: string,
  ) {
    const attachment = await policyRepository.findAttachment(
      tenantId,
      policyId,
      attachmentId,
    );
    if (!attachment) {
      throw new Error("Attachment not found");
    }

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      throw new Error("File storage is not configured");
    }

    const { data, error } = await supabase.storage
      .from(POLICY_DOCUMENTS_BUCKET)
      .download(attachment.storagePath);

    if (error || !data) {
      throw new Error(error?.message ?? "Could not download file");
    }

    const buffer = Buffer.from(await data.arrayBuffer());

    return {
      buffer,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    };
  },

  async transitionStatus(
    input: { tenantId: string; actorUserId: string; policyId: string },
    from: PolicyStatus,
    to: PolicyStatus,
    auditAction: string,
    approvedAt?: Date | null,
  ) {
    const existing = await policyRepository.findById(
      input.tenantId,
      input.policyId,
    );
    if (!existing) {
      throw new Error("Policy not found");
    }
    if (existing.status !== from) {
      throw new Error(`Policy must be in ${from} status`);
    }

    const policy = await policyRepository.setStatus(
      input.tenantId,
      input.policyId,
      to,
      { approvedAt },
    );
    if (!policy) {
      throw new Error("Policy not found");
    }

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: auditAction,
      entityType: "Policy",
      entityId: policy.id,
      metadata: { title: policy.title, status: policy.status },
    });

    return policy;
  },
};
