import type { Prisma } from "@/lib/database/generated/prisma/client";

import { OPEN_TRANSFER_LINE_STATUSES } from "@/features/logistics/services/delivery-transfer.planner";
import { prisma } from "@/lib/database/client";

export interface OpenTransferRef {
  serialNumberId: string;
  serialNo: string;
  transferId: string;
  transferNo: string;
}

/**
 * Units held by a PENDING or APPROVED unit-transfer line. Shared by delivery
 * accept / reject (they must leave these units alone) and transfer create.
 */
export async function findOpenTransferLines(
  db: Prisma.TransactionClient | typeof prisma,
  tenantId: string,
  serialNumberIds: readonly string[],
): Promise<OpenTransferRef[]> {
  if (serialNumberIds.length === 0) return [];
  const rows = await db.deliveryTransferLine.findMany({
    where: {
      serialNumberId: { in: [...serialNumberIds] },
      status: { in: [...OPEN_TRANSFER_LINE_STATUSES] },
      transfer: { tenantId },
    },
    select: {
      serialNumberId: true,
      serialNumber: { select: { serialNo: true } },
      transfer: { select: { id: true, transferNo: true } },
    },
  });
  return rows.map((row) => ({
    serialNumberId: row.serialNumberId,
    serialNo: row.serialNumber.serialNo,
    transferId: row.transfer.id,
    transferNo: row.transfer.transferNo,
  }));
}

/** Throws "Unit {serialNo} is on transfer {transferNo}" for the first held unit. */
export async function assertNotOnOpenTransfer(
  db: Prisma.TransactionClient | typeof prisma,
  tenantId: string,
  serialNumberIds: readonly string[],
): Promise<void> {
  const [held] = await findOpenTransferLines(db, tenantId, serialNumberIds);
  if (held) throw new Error(`Unit ${held.serialNo} is on transfer ${held.transferNo}`);
}
