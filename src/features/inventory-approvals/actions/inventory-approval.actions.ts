"use server";

import { parseTablePageSize } from "@/components/data-table/table-page-size";
import {
  INVENTORY_APPROVAL_SOURCES,
  INVENTORY_APPROVAL_STATUSES,
  INVENTORY_APPROVAL_VIEW,
} from "@/features/inventory-approvals/constants/inventory-approval-display";
import { inventoryApprovalRepository } from "@/features/inventory-approvals/repositories/inventory-approval.repository";
import { requirePermission } from "@/lib/auth/permissions";

export async function listInventoryApprovalsAction(params: {
  page?: number;
  limit?: number;
  status?: string;
  sourceType?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const session = await requirePermission(INVENTORY_APPROVAL_VIEW);
  return inventoryApprovalRepository.list(session.user.tenantId, {
    page: params.page,
    limit: parseTablePageSize(params.limit),
    status: INVENTORY_APPROVAL_STATUSES.find((status) => status === params.status),
    sourceType: INVENTORY_APPROVAL_SOURCES.find((source) => source === params.sourceType),
    q: params.q,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
}
