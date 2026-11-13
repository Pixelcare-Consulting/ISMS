import type { ReasonStatusCategory } from "@prisma/client";

import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";

export const reasonStatusService = {
  listForTenant(tenantId: string) {
    return reasonStatusRepository.listByTenant(tenantId);
  },

  listActiveCodes(tenantId: string, category: ReasonStatusCategory) {
    return reasonStatusRepository.listActiveCodesByCategory(tenantId, category);
  },

  /** The code's id, or null when this tenant's status settings do not have it. */
  async findCodeId(tenantId: string, category: ReasonStatusCategory, code: string) {
    const row = await reasonStatusRepository.findCodeId(tenantId, category, code);
    return row?.id ?? null;
  },

  async requireCodeId(tenantId: string, category: ReasonStatusCategory, code: string) {
    const row = await reasonStatusRepository.findCodeId(tenantId, category, code);
    if (!row) {
      throw new Error(`Status code not configured: ${category}/${code}`);
    }
    return row.id;
  },

  async createCode(input: {
    tenantId: string;
    category: ReasonStatusCategory;
    name: string;
    code: string;
    color?: string | null;
    sortOrder?: number;
  }) {
    const group = await reasonStatusRepository.findGroup(input.tenantId, input.category);
    if (!group) {
      throw new Error(`Status group not found: ${input.category}`);
    }

    const normalized = input.code.trim().toUpperCase();
    const duplicate = group.codes.find((c) => c.code === normalized);
    if (duplicate) {
      throw new Error(`Code "${normalized}" already exists in this group`);
    }

    return reasonStatusRepository.createCode({
      tenantId: input.tenantId,
      reasonStatusId: group.id,
      name: input.name.trim(),
      code: normalized,
      color: input.color,
      sortOrder: input.sortOrder,
    });
  },

  async updateCode(
    tenantId: string,
    codeId: string,
    data: {
      name?: string;
      recordStatus?: "active" | "inactive";
      sortOrder?: number;
      color?: string | null;
    },
  ) {
    return reasonStatusRepository.updateCode(tenantId, codeId, data);
  },

  async deactivateCode(tenantId: string, codeId: string) {
    const usage = await reasonStatusRepository.countCodeUsage(tenantId, codeId);
    if (usage > 0) {
      return reasonStatusRepository.updateCode(tenantId, codeId, {
        recordStatus: "inactive",
      });
    }
    return reasonStatusRepository.updateCode(tenantId, codeId, {
      recordStatus: "inactive",
    });
  },
};
