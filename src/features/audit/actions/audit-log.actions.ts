"use server";

import { auditService } from "@/features/audit/services/audit.service";
import type {
  AuditLogListSort,
  AuditLogListSortDir,
} from "@/features/audit/repositories/audit-log.repository";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requirePermission } from "@/lib/auth/permissions";

const AUDIT_LOG_SORT_FIELDS = new Set<AuditLogListSort>([
  "createdAt",
  "user",
  "action",
  "entityType",
]);

function parseAuditLogSort(value?: string): AuditLogListSort | undefined {
  if (value && AUDIT_LOG_SORT_FIELDS.has(value as AuditLogListSort)) {
    return value as AuditLogListSort;
  }
  return undefined;
}

function parseAuditLogSortDir(value?: string): AuditLogListSortDir | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}

export async function listAuditLogsAction(input?: {
  page?: number;
  limit?: number;
  action?: string;
  entityType?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  sortDir?: string;
}) {
  const session = await requirePermission("audit_logs.view");

  return auditService.listForTenant({
    tenantId: session.user.tenantId,
    page: input?.page,
    limit: parseTablePageSize(input?.limit),
    action: input?.action || undefined,
    entityType: input?.entityType || undefined,
    search: input?.q || undefined,
    dateFrom: input?.dateFrom || undefined,
    dateTo: input?.dateTo || undefined,
    sort: parseAuditLogSort(input?.sort),
    sortDir: parseAuditLogSortDir(input?.sortDir),
  });
}

export async function getAuditLogFilterOptionsAction() {
  const session = await requirePermission("audit_logs.view");
  return auditService.listFilterOptions(session.user.tenantId);
}
