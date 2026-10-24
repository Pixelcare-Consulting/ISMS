import { Prisma } from "@/lib/database/generated/prisma/client";

/**
 * Current placement is one row across branch, warehouse, and service-center
 * inventory. History stays in serial history, deliveries, transfers, pullouts,
 * and sale lines. Callers lock serials before inventory rows, in id order.
 */

export type PlacementClient = {
  $queryRaw: Prisma.TransactionClient["$queryRaw"];
  $executeRaw: Prisma.TransactionClient["$executeRaw"];
  serialNumber: Prisma.TransactionClient["serialNumber"];
  branchInventory: Prisma.TransactionClient["branchInventory"];
  warehouseInventory: Prisma.TransactionClient["warehouseInventory"];
  serviceCenterInventory: Prisma.TransactionClient["serviceCenterInventory"];
};

export type PlacementTable = "branch" | "warehouse" | "service_center";

export interface CurrentPlacement {
  table: PlacementTable;
  id: string;
  serialNumberId: string;
  serialNo: string;
  tenantId: string;
  place: string;
  branchId: string | null;
  warehouseId: string | null;
  warehouseLocationId: string | null;
  serviceCenterId: string | null;
  serviceCenterLocationId: string | null;
  statusCode: string | null;
}

export interface SerialRegistrationKey {
  tenantId: string;
  serialNo: string;
}

function uniqueSorted(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
}

function registrationKey(row: SerialRegistrationKey): string {
  return `${row.tenantId}:${row.serialNo}`;
}

/**
 * Lock existing serial rows in id order so two batches cannot deadlock.
 * Missing ids are not locked; register them first.
 */
export async function lockSerialNumbers(
  tx: Pick<PlacementClient, "$queryRaw">,
  ids: readonly string[],
): Promise<void> {
  const ordered = uniqueSorted(ids);
  if (ordered.length === 0) return;
  await tx.$queryRaw`
    SELECT id
    FROM serial_numbers
    WHERE id IN (${Prisma.join(ordered)})
    ORDER BY id
    FOR UPDATE
  `;
}

/**
 * Lock a serial number before its row exists. Keys are tenantId:serialNo,
 * sorted, so two registrations of the same number wait on each other.
 */
export async function lockSerialRegistrations(
  tx: Pick<PlacementClient, "$executeRaw">,
  keys: readonly SerialRegistrationKey[],
): Promise<void> {
  const ordered = [...keys]
    .map((key) => ({ tenantId: key.tenantId.trim(), serialNo: key.serialNo.trim() }))
    .filter((key) => key.tenantId && key.serialNo)
    .sort((left, right) => {
      const a = registrationKey(left);
      const b = registrationKey(right);
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });
  const seen = new Set<string>();
  for (const key of ordered) {
    const token = registrationKey(key);
    if (seen.has(token)) continue;
    seen.add(token);
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${key.tenantId}), hashtext(${key.serialNo}))
    `;
  }
}

function placeLabel(table: PlacementTable, label: string, statusCode: string | null): string {
  switch (table) {
    case "branch":
      return statusCode ? `branch ${label} (${statusCode})` : `branch ${label}`;
    case "warehouse":
      return `warehouse ${label}`;
    case "service_center":
      return statusCode ? `service center ${label} (${statusCode})` : `service center ${label}`;
    default: {
      const unreachable: never = table;
      return unreachable;
    }
  }
}

/** Every current placement row for these serials. */
export async function loadCurrentPlacements(
  tx: Pick<
    PlacementClient,
    "branchInventory" | "warehouseInventory" | "serviceCenterInventory"
  >,
  serialNumberIds: readonly string[],
): Promise<CurrentPlacement[]> {
  const ids = uniqueSorted(serialNumberIds);
  if (ids.length === 0) return [];

  const [branchRows, warehouseRows, serviceRows] = await Promise.all([
    tx.branchInventory.findMany({
      where: { serialNumberId: { in: ids } },
      select: {
        id: true,
        tenantId: true,
        serialNumberId: true,
        branchId: true,
        branch: { select: { name: true } },
        statusCode: { select: { code: true } },
        serialNumber: { select: { serialNo: true } },
      },
    }),
    tx.warehouseInventory.findMany({
      where: { serialNumberId: { in: ids } },
      select: {
        id: true,
        tenantId: true,
        serialNumberId: true,
        warehouseLocationId: true,
        warehouseLocation: {
          select: {
            code: true,
            warehouseId: true,
            warehouse: { select: { code: true } },
          },
        },
        serialNumber: { select: { serialNo: true } },
      },
    }),
    tx.serviceCenterInventory.findMany({
      where: { serialNumberId: { in: ids } },
      select: {
        id: true,
        tenantId: true,
        serialNumberId: true,
        serviceCenterId: true,
        serviceCenterLocationId: true,
        serviceCenter: { select: { name: true } },
        serviceCenterLocation: { select: { code: true } },
        statusCode: { select: { code: true } },
        serialNumber: { select: { serialNo: true } },
      },
    }),
  ]);

  const placements: CurrentPlacement[] = [];
  for (const row of branchRows) {
    const statusCode = row.statusCode.code;
    placements.push({
      table: "branch",
      id: row.id,
      serialNumberId: row.serialNumberId,
      serialNo: row.serialNumber.serialNo,
      tenantId: row.tenantId,
      place: placeLabel("branch", row.branch.name, statusCode),
      branchId: row.branchId,
      warehouseId: null,
      warehouseLocationId: null,
      serviceCenterId: null,
      serviceCenterLocationId: null,
      statusCode,
    });
  }
  for (const row of warehouseRows) {
    const label = `${row.warehouseLocation.warehouse.code} / ${row.warehouseLocation.code}`;
    placements.push({
      table: "warehouse",
      id: row.id,
      serialNumberId: row.serialNumberId,
      serialNo: row.serialNumber.serialNo,
      tenantId: row.tenantId,
      place: placeLabel("warehouse", label, null),
      branchId: null,
      warehouseId: row.warehouseLocation.warehouseId,
      warehouseLocationId: row.warehouseLocationId,
      serviceCenterId: null,
      serviceCenterLocationId: null,
      statusCode: null,
    });
  }
  for (const row of serviceRows) {
    const statusCode = row.statusCode?.code ?? null;
    const label = `${row.serviceCenter.name} / ${row.serviceCenterLocation.code}`;
    placements.push({
      table: "service_center",
      id: row.id,
      serialNumberId: row.serialNumberId,
      serialNo: row.serialNumber.serialNo,
      tenantId: row.tenantId,
      place: placeLabel("service_center", label, statusCode),
      branchId: null,
      warehouseId: null,
      warehouseLocationId: null,
      serviceCenterId: row.serviceCenterId,
      serviceCenterLocationId: row.serviceCenterLocationId,
      statusCode,
    });
  }
  return placements;
}

/**
 * Reject any occupying row this write is not explicitly replacing.
 * The error names the serial and the other place.
 */
export function assertExclusivePlacement(input: {
  placements: readonly CurrentPlacement[];
  replacingIds: readonly string[];
}): void {
  const replacing = new Set(input.replacingIds);
  const blocking = input.placements.filter((row) => !replacing.has(row.id));
  if (blocking.length === 0) return;

  const bySerial = new Map<string, CurrentPlacement[]>();
  for (const row of blocking) {
    const current = bySerial.get(row.serialNumberId) ?? [];
    current.push(row);
    bySerial.set(row.serialNumberId, current);
  }

  const messages = [...bySerial.values()].map((rows) => {
    const serialNo = rows[0]?.serialNo || "This serial";
    const places = rows.map((row) => row.place).join(", ");
    return `${serialNo} is already at ${places}.`;
  });
  throw new Error(messages.join(" "));
}
