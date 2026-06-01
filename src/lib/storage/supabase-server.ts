import type { SupabaseClient } from "@supabase/supabase-js";

export const POLICY_DOCUMENTS_BUCKET = "policy-documents";
export const AUDIT_ARCHIVES_BUCKET = "audit-archives";

export async function getSupabaseAdmin(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  const { createClient } = await import("@supabase/supabase-js");

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function buildPolicyAttachmentPath(input: {
  tenantId: string;
  policyId: string;
  version: number;
  fileName: string;
  fileId: string;
}) {
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `tenants/${input.tenantId}/policies/${input.policyId}/v${input.version}/${input.fileId}-${safeName}`;
}

export function buildAuditArchivePath(input: {
  tenantId: string;
  batchId: string;
  cutoffDate: Date;
}) {
  const year = input.cutoffDate.getUTCFullYear();
  const month = String(input.cutoffDate.getUTCMonth() + 1).padStart(2, "0");
  return `tenants/${input.tenantId}/archives/${year}/${month}/audit-${input.batchId}.json`;
}
