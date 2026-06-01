import { auditLogRepository } from "@/features/audit/repositories/audit-log.repository";
import {
  AUDIT_ARCHIVES_BUCKET,
  buildAuditArchivePath,
  getSupabaseAdmin,
} from "@/lib/storage/supabase-server";
import { logger } from "@/lib/shared/logger";

/** Rows older than this stay in Postgres; older rows are archived to object storage. */
export function getAuditLogHotDays(): number {
  const raw = process.env.AUDIT_LOG_HOT_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : 90;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
}

const BATCH_SIZE = 500;
const MAX_BATCHES = 20;

export interface AuditArchiveResult {
  archivedCount: number;
  batches: number;
  cutoffDate: string;
  storagePaths: string[];
}

export const auditArchiveService = {
  /**
   * Export audit logs older than AUDIT_LOG_HOT_DAYS (default 90) to Supabase Storage
   * under audit-archives/, then delete archived rows from Postgres.
   */
  async archiveColdLogs(tenantId: string): Promise<AuditArchiveResult> {
    const hotDays = getAuditLogHotDays();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - hotDays);

    const supabase = await getSupabaseAdmin();
    if (!supabase) {
      throw new Error(
        "Audit archive requires Supabase Storage. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      );
    }

    let archivedCount = 0;
    let batches = 0;
    const storagePaths: string[] = [];

    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const rows = await auditLogRepository.findOlderThan(tenantId, cutoff, BATCH_SIZE);
      if (rows.length === 0) {
        break;
      }

      const batchId = crypto.randomUUID();
      const storagePath = buildAuditArchivePath({
        tenantId,
        batchId,
        cutoffDate: cutoff,
      });

      const payload = {
        tenantId,
        archivedAt: new Date().toISOString(),
        cutoffDate: cutoff.toISOString(),
        hotDays,
        count: rows.length,
        logs: rows,
      };

      const { error } = await supabase.storage
        .from(AUDIT_ARCHIVES_BUCKET)
        .upload(storagePath, JSON.stringify(payload), {
          contentType: "application/json",
          upsert: false,
        });

      if (error) {
        throw new Error(`Failed to upload audit archive: ${error.message}`);
      }

      await auditLogRepository.deleteByIds(
        tenantId,
        rows.map((row: { id: string }) => row.id),
      );

      archivedCount += rows.length;
      batches += 1;
      storagePaths.push(storagePath);

      logger.info(
        { tenantId, batchId, count: rows.length, storagePath },
        "audit logs archived to cold storage",
      );

      if (rows.length < BATCH_SIZE) {
        break;
      }
    }

    return {
      archivedCount,
      batches,
      cutoffDate: cutoff.toISOString(),
      storagePaths,
    };
  },
};
