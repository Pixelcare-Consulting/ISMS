import type { PrismaClient } from "@prisma/client";

/** Demo branch/warehouse serial prefixes created by BRS / warehouse inventory seed. */
export const DEMO_STOCK_SERIAL_PREFIXES = ["SN-WMK-", "SN-WRC-", "SN-WHSE-"] as const;

/**
 * Wipe demo BranchInventory, WarehouseInventory, and SerialNumber rows for the
 * demo tenant (SN-WMK-*, SN-WRC-*, SN-WHSE-*). Safe to re-run.
 */
export async function cleanupDemoStock(prisma: PrismaClient, tenantId: string) {
  const serials = await prisma.serialNumber.findMany({
    where: {
      tenantId,
      OR: DEMO_STOCK_SERIAL_PREFIXES.map((prefix) => ({
        serialNo: { startsWith: prefix },
      })),
    },
    select: { id: true, serialNo: true },
  });

  if (serials.length === 0) {
    console.log("Demo stock cleanup: no matching serials found");
    return { serialsDeleted: 0, branchInventoriesDeleted: 0, warehouseInventoriesDeleted: 0 };
  }

  const ids = serials.map((row) => row.id);

  const [branchInventoriesDeleted, warehouseInventoriesDeleted] = await prisma.$transaction([
    prisma.branchInventory.deleteMany({
      where: { tenantId, serialNumberId: { in: ids } },
    }),
    prisma.warehouseInventory.deleteMany({
      where: { tenantId, serialNumberId: { in: ids } },
    }),
  ]);

  const serialsDeleted = await prisma.serialNumber.deleteMany({
    where: { tenantId, id: { in: ids } },
  });

  console.log(
    `Demo stock cleanup: removed ${serialsDeleted.count} serials, ` +
      `${branchInventoriesDeleted.count} branch inventory, ` +
      `${warehouseInventoriesDeleted.count} warehouse inventory — ` +
      serials.map((row) => row.serialNo).join(", "),
  );

  return {
    serialsDeleted: serialsDeleted.count,
    branchInventoriesDeleted: branchInventoriesDeleted.count,
    warehouseInventoriesDeleted: warehouseInventoriesDeleted.count,
  };
}
