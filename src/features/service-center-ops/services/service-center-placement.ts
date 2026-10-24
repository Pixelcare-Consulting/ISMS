import type { Prisma } from "@/lib/database/generated/prisma/client";

import {
  assertExclusivePlacement,
  loadCurrentPlacements,
  lockSerialNumbers,
} from "@/features/inventory/services/serial-placement";

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
