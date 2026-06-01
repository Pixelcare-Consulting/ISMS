import {
  auditLogRepository,
  type CreateAuditLogInput,
  type ListAuditLogsInput,
} from "@/features/audit/repositories/audit-log.repository";

export const auditService = {
  async log(input: CreateAuditLogInput) {
    return auditLogRepository.create(input);
  },

  listForTenant(input: ListAuditLogsInput) {
    return auditLogRepository.listForTenant(input);
  },

  listFilterOptions(tenantId: string) {
    return Promise.all([
      auditLogRepository.listDistinctActions(tenantId),
      auditLogRepository.listDistinctEntityTypes(tenantId),
    ]).then(([actions, entityTypes]) => ({ actions, entityTypes }));
  },
};
