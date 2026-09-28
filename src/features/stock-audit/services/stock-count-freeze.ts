import { prisma } from "@/lib/database/client";
import { STOCK_COUNT_FREEZE_SESSION_STATUSES } from "@/features/stock-audit/constants/stock-count-workflow";

/**
 * Soft freeze: block branch STK movements for serials on an active P-Count session
 * (B1-style freeze while counting / until differences are posted).
 */
export async function assertSerialsNotFrozenInStockCount(
  tenantId: string,
  serialNumberIds: string[],
): Promise<void> {
  if (serialNumberIds.length === 0) return;

  const frozen = await prisma.stockCountLine.findFirst({
    where: {
      serialNumberId: { in: serialNumberIds },
      session: {
        tenantId,
        status: { in: [...STOCK_COUNT_FREEZE_SESSION_STATUSES] },
      },
    },
    select: {
      serialNumber: { select: { serialNo: true } },
      session: { select: { sessionNo: true } },
    },
  });

  if (frozen) {
    throw new Error(
      `Serial ${frozen.serialNumber.serialNo} is frozen by stock count ${frozen.session.sessionNo}. Finish or post the count before moving stock.`,
    );
  }
}
