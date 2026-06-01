"use server";

import { revalidatePath } from "next/cache";

import { policyService } from "@/features/policies/services/policy.service";
import {
  canManagePolicies,
  canViewPolicy,
  hasPermission,
  requirePermission,
  requirePolicyAccess,
} from "@/lib/auth/permissions";

function actorName(session: { user: { name?: string | null; email?: string | null } }) {
  return session.user.name ?? session.user.email ?? "A user";
}

export async function listPoliciesAction() {
  const session = await requirePolicyAccess();
  const approvedOnly = !canManagePolicies(session.user.permissions);
  return policyService.listPolicies(session.user.tenantId, approvedOnly);
}

export async function getPolicyAction(policyId: string) {
  const session = await requirePolicyAccess();
  const policy = await policyService.getPolicy(session.user.tenantId, policyId);
  if (!policy) {
    return null;
  }
  if (!canViewPolicy(policy, session.user.permissions)) {
    const { redirect } = await import("next/navigation");
    redirect("/dashboard?error=forbidden");
  }
  return policy;
}

export async function listPolicyApproversAction() {
  const session = await requirePolicyAccess();
  if (!hasPermission(session.user.permissions, "policies.create")) {
    const { redirect } = await import("next/navigation");
    redirect("/dashboard?error=forbidden");
  }
  return policyService.listApprovers(session.user.tenantId);
}

export async function createPolicyAction(formData: FormData) {
  const session = await requirePermission("policies.create");

  try {
    const policy = await policyService.createPolicy({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? "") || undefined,
      content: String(formData.get("content") ?? ""),
    });

    const file = formData.get("attachment");
    if (file instanceof File && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      await policyService.uploadAttachment({
        tenantId: session.user.tenantId,
        actorUserId: session.user.id,
        policyId: policy.id,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        fileBuffer: buffer,
      });
    }

    revalidatePath("/policies");
    revalidatePath("/dashboard");
    return { success: true, policyId: policy.id };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to create policy",
    };
  }
}

export async function updatePolicyAction(formData: FormData) {
  const session = await requirePermission("policies.create");

  try {
    const policyId = String(formData.get("policyId") ?? "");
    await policyService.updatePolicy({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      policyId,
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? "") || undefined,
      content: String(formData.get("content") ?? ""),
    });

    const file = formData.get("attachment");
    if (file instanceof File && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      await policyService.uploadAttachment({
        tenantId: session.user.tenantId,
        actorUserId: session.user.id,
        policyId,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        fileBuffer: buffer,
      });
    }

    revalidatePath("/policies");
    revalidatePath(`/policies/${policyId}`);
    return { success: true, policyId };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to update policy",
    };
  }
}

export async function createRevisionAction(policyId: string) {
  const session = await requirePermission("policies.create");

  try {
    const policy = await policyService.createRevision({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      policyId,
    });
    revalidatePath("/policies");
    revalidatePath(`/policies/${policyId}`);
    return { success: true, policyId: policy.id };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to create revision",
    };
  }
}

export async function submitPolicyForReviewAction(input: {
  policyId: string;
  comment?: string;
  reviewerId?: string;
}) {
  const session = await requirePermission("policies.create");

  try {
    await policyService.submitForReview({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      actorName: actorName(session),
      policyId: input.policyId,
      comment: input.comment,
      reviewerId: input.reviewerId,
    });
    revalidatePath("/policies");
    revalidatePath(`/policies/${input.policyId}`);
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to submit policy",
    };
  }
}

export async function approvePolicyAction(input: {
  policyId: string;
  comment?: string;
}) {
  const session = await requirePermission("policies.approve");

  try {
    await policyService.approvePolicy({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      actorName: actorName(session),
      policyId: input.policyId,
      comment: input.comment,
    });
    revalidatePath("/policies");
    revalidatePath(`/policies/${input.policyId}`);
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to approve policy",
    };
  }
}

export async function revertPolicyToDraftAction(input: {
  policyId: string;
  comment?: string;
}) {
  const session = await requirePermission("policies.create");

  try {
    await policyService.revertToDraft({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      actorName: actorName(session),
      policyId: input.policyId,
      comment: input.comment,
    });
    revalidatePath("/policies");
    revalidatePath(`/policies/${input.policyId}`);
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to revert policy",
    };
  }
}

export async function deletePolicyAction(policyId: string) {
  const session = await requirePermission("policies.create");

  try {
    await policyService.deletePolicy({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      policyId,
    });
    revalidatePath("/policies");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to delete policy",
    };
  }
}

export async function uploadPolicyAttachmentAction(formData: FormData) {
  const session = await requirePermission("policies.create");

  try {
    const policyId = String(formData.get("policyId") ?? "");
    const file = formData.get("attachment");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("No file selected");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await policyService.uploadAttachment({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      policyId,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      fileBuffer: buffer,
    });

    revalidatePath(`/policies/${policyId}`);
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to upload attachment",
    };
  }
}
