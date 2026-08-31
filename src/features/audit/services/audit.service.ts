import {
  auditLogRepository,
  type CreateAuditLogInput,
  type ListAuditLogsInput,
} from "@/features/audit/repositories/audit-log.repository";

export const auditService = {
  async log(input: CreateAuditLogInput) {
    return auditLogRepository.create(input);
  },

  /** Bulk path for importers — one insert instead of one round trip per row. */
  async logMany(inputs: CreateAuditLogInput[]) {
    return auditLogRepository.createMany(inputs);
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
