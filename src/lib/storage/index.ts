import { localFsStorage } from "@/lib/storage/local-fs";
import { supabaseStorage } from "@/lib/storage/supabase-storage";
import type { ObjectStorage } from "@/lib/storage/types";

export const POLICY_DOCUMENTS_PREFIX = "policy-documents";
export const AUDIT_ARCHIVES_PREFIX = "audit-archives";
export const DEFECT_REPORT_PHOTOS_PREFIX = "defect-report-photos";

/**
 * Resolve object storage for the current runtime.
 *
 * Default is local filesystem (local-fs) — used for local dev and Docker/Ubuntu
 * staging with `STORAGE_ROOT` (e.g. `/app/data/uploads`). Supabase is opt-in only
 * via `STORAGE_DRIVER=supabase`; it is not assumed for production or Vercel.
 */
export function getObjectStorage(): ObjectStorage {
  const driver = process.env.STORAGE_DRIVER?.trim().toLowerCase();
  if (driver === "supabase") {
    return supabaseStorage;
  }
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

export function buildDefectReportPhotoPath(input: {
  tenantId: string;
  reportId: string;
  fileId: string;
  fileName: string;
}) {
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${DEFECT_REPORT_PHOTOS_PREFIX}/tenants/${input.tenantId}/reports/${input.reportId}/${input.fileId}-${safeName}`;
}

export type { ObjectStorage, StorageDownloadResult, StorageUploadInput } from "@/lib/storage/types";
