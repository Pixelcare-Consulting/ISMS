"use server";

import { auditService } from "@/features/audit/services/audit.service";
import { requirePermission } from "@/lib/auth/permissions";

export async function listAuditLogsAction(input?: {
  page?: number;
  action?: string;
  entityType?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const session = await requirePermission("reports.view");

  return auditService.listForTenant({
    tenantId: session.user.tenantId,
    page: input?.page,
    action: input?.action || undefined,
    entityType: input?.entityType || undefined,
    search: input?.q || undefined,
    dateFrom: input?.dateFrom || undefined,
    dateTo: input?.dateTo || undefined,
  });
}

export async function getAuditLogFilterOptionsAction() {
  const session = await requirePermission("reports.view");
  return auditService.listFilterOptions(session.user.tenantId);
}
