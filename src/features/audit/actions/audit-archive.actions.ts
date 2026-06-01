"use server";

import { auditArchiveService } from "@/features/audit/services/audit-archive.service";
import { requireCompanyManage } from "@/lib/auth/permissions";

export async function archiveAuditLogsAction() {
  const session = await requireCompanyManage();
  return auditArchiveService.archiveColdLogs(session.user.tenantId);
}
