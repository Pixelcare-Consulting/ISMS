"use server";

import type { UnitHistoryEvent } from "@/features/inventory/lib/unit-history-events";
import { unitHistoryService } from "@/features/inventory/services/unit-history.service";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";

function isUnrestricted(permissions: string[] | undefined) {
  return (
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "master_data.manage")
  );
}

export async function listUnitHistoryAction(
  serialNumberId: string,
): Promise<{ events: UnitHistoryEvent[] } | { error: string }> {
  const session = await requirePermission("inventory.view");
  try {
    const events = await unitHistoryService.listForSerial({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      isUnrestricted: isUnrestricted(session.user.permissions),
      serialNumberId,
    });
    return { events };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not load history.",
    };
  }
}
