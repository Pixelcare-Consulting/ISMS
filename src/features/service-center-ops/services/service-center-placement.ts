import type { Prisma } from "@/lib/database/generated/prisma/client";

import {
  assertExclusivePlacement,
  loadCurrentPlacements,
  lockSerialNumbers,
} from "@/features/inventory/services/serial-placement";

/**
 * For transactions that move a whole SAP DR into a service center. Prisma's 5 s default is
 * too short once each query crosses to a remote database; the work itself is a fixed number
 * of queries, so this only absorbs latency.
 */
export const SC_DR_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

type ServiceCenterPlacementClient = Pick<
  Prisma.TransactionClient,
  | "$queryRaw"
  | "branchInventory"
  | "warehouseInventory"
  | "serviceCenterInventory"
>;

/**
 * Put a serial into one service-center location.
 * The same location updates the existing row. Any other current placement is refused.
 */
export async function placeServiceCenterUnit(
  tx: ServiceCenterPlacementClient,
  input: {
    tenantId: string;
    serviceCenterId: string;
    serviceCenterLocationId: string;
    serialNumberId: string;
    statusCodeId: string;
  },
): Promise<string> {
  await lockSerialNumbers(tx, [input.serialNumberId]);
  const occupied = await loadCurrentPlacements(tx, [input.serialNumberId]);
  const sameLocation = occupied.find(
    (row) =>
      row.table === "service_center" &&
      row.serviceCenterLocationId === input.serviceCenterLocationId,
  );
  if (sameLocation) {
    assertExclusivePlacement({ placements: occupied, replacingIds: [sameLocation.id] });
    await tx.serviceCenterInventory.update({
      where: { id: sameLocation.id },
      data: {
        statusCodeId: input.statusCodeId,
        serviceCenterId: input.serviceCenterId,
      },
    });
    return sameLocation.id;
  }

  assertExclusivePlacement({ placements: occupied, replacingIds: [] });
  const created = await tx.serviceCenterInventory.create({
    data: {
      tenantId: input.tenantId,
      serviceCenterId: input.serviceCenterId,
      serviceCenterLocationId: input.serviceCenterLocationId,
      serialNumberId: input.serialNumberId,
      statusCodeId: input.statusCodeId,
    },
  });
  return created.id;
}

/**
 * `placeServiceCenterUnit` for many serials at one location, in a fixed number of queries:
 * one lock, one placement read, one update, one insert. A DR's serials arrive together, and a
 * query per serial outlived the transaction timeout on a remote database.
 */
export async function placeServiceCenterUnits(
  tx: ServiceCenterPlacementClient,
  input: {
    tenantId: string;
    serviceCenterId: string;
    serviceCenterLocationId: string;
    serialNumberIds: readonly string[];
    statusCodeId: string;
  },
): Promise<void> {
  const serialNumberIds = [...new Set(input.serialNumberIds)];
  if (serialNumberIds.length === 0) return;
  await lockSerialNumbers(tx, serialNumberIds);
  const occupied = await loadCurrentPlacements(tx, serialNumberIds);
  const sameLocation = occupied.filter(
    (row) =>
      row.table === "service_center" &&
      row.serviceCenterLocationId === input.serviceCenterLocationId,
  );
  assertExclusivePlacement({ placements: occupied, replacingIds: sameLocation.map((row) => row.id) });

  if (sameLocation.length > 0) {
    await tx.serviceCenterInventory.updateMany({
      where: { id: { in: sameLocation.map((row) => row.id) } },
      data: { statusCodeId: input.statusCodeId, serviceCenterId: input.serviceCenterId },
    });
  }
  const placed = new Set(sameLocation.map((row) => row.serialNumberId));
  const toCreate = serialNumberIds.filter((id) => !placed.has(id));
  if (toCreate.length > 0) {
    await tx.serviceCenterInventory.createMany({
      data: toCreate.map((serialNumberId) => ({
        tenantId: input.tenantId,
        serviceCenterId: input.serviceCenterId,
        serviceCenterLocationId: input.serviceCenterLocationId,
        serialNumberId,
        statusCodeId: input.statusCodeId,
      })),
    });
  }
}
