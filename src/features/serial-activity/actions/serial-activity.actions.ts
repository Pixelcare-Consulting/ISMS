"use server";

import { serialActivityRepository } from "@/features/serial-activity/repositories/serial-activity.repository";
import type { SerialActivityType } from "@/features/serial-activity/constants/serial-activity-display";
import { requirePermission } from "@/lib/auth/permissions";

export async function listSerialActivityAction(params: {
  page?: number;
  type?: SerialActivityType;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const session = await requirePermission("serial_logs.view");
  return serialActivityRepository.list(session.user.tenantId, {
    page: params.page,
    type: params.type,
    q: params.q,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
}
