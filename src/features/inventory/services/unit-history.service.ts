import { aorService } from "@/features/aors/services/aor.service";
import { buildUnitHistoryEvents, type UnitHistoryEvent } from "@/features/inventory/lib/unit-history-events";
import { unitHistoryRepository } from "@/features/inventory/repositories/unit-history.repository";

/**
 * History for one serial the person can already see on Inventory v2.
 * Branch scope matches the v2 list: every branch for an unrestricted user, otherwise their area.
 */
export const unitHistoryService = {
  async listForSerial(input: {
    tenantId: string;
    userId: string;
    isUnrestricted: boolean;
    serialNumberId: string;
  }): Promise<UnitHistoryEvent[]> {
    const serialNumberId = input.serialNumberId.trim();
    if (!serialNumberId) return [];

    const branchIds = input.isUnrestricted
      ? null
      : await aorService.getBranchIdsForUser(input.tenantId, input.userId);
    if (branchIds && branchIds.length === 0) return [];

    const snapshot = await unitHistoryRepository.load(input.tenantId, serialNumberId, branchIds);
    if (!snapshot) return [];
    return buildUnitHistoryEvents(snapshot);
  },
};
