import { localFsStorage } from "@/lib/storage/local-fs";
import type { ObjectStorage } from "@/lib/storage/types";

export const POLICY_DOCUMENTS_PREFIX = "policy-documents";
export const AUDIT_ARCHIVES_PREFIX = "audit-archives";

export function getObjectStorage(): ObjectStorage {
  return localFsStorage;
}

export function buildPolicyAttachmentPath(input: {
  tenantId: string;
  policyId: string;
  version: number;
  fileName: string;
  fileId: string;
}) {
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${POLICY_DOCUMENTS_PREFIX}/tenants/${input.tenantId}/policies/${input.policyId}/v${input.version}/${input.fileId}-${safeName}`;
}

export function buildAuditArchivePath(input: {
  tenantId: string;
  batchId: string;
  cutoffDate: Date;
}) {
  const year = input.cutoffDate.getUTCFullYear();
  const month = String(input.cutoffDate.getUTCMonth() + 1).padStart(2, "0");
  return `${AUDIT_ARCHIVES_PREFIX}/tenants/${input.tenantId}/archives/${year}/${month}/audit-${input.batchId}.json`;
}

export type { ObjectStorage, StorageDownloadResult, StorageUploadInput } from "@/lib/storage/types";
