"use server";

import { serialActivityRepository } from "@/features/serial-activity/repositories/serial-activity.repository";
import type { SerialActivitySortDir } from "@/features/serial-activity/repositories/serial-activity.repository";
import type { SerialActivityType } from "@/features/serial-activity/constants/serial-activity-display";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requirePermission } from "@/lib/auth/permissions";

function parseSerialActivitySortDir(value?: string): SerialActivitySortDir | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}

export async function listSerialActivityAction(params: {
  page?: number;
  limit?: number;
  type?: SerialActivityType;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  sortDir?: string;
}) {
  const session = await requirePermission("serial_logs.view");
  return serialActivityRepository.list(session.user.tenantId, {
    page: params.page,
    limit: parseTablePageSize(params.limit),
    type: params.type,
    q: params.q,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    sortDir: parseSerialActivitySortDir(params.sortDir),
  });
}
