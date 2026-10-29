import { Prisma } from "@/lib/database/generated/prisma/client";
import { auditService } from "@/features/audit/services/audit.service";
import { warehouseRepository } from "@/features/warehouses/repositories/warehouse.repository";
import {
  duplicateLocationCodeMessage,
  sameLocationCode,
} from "@/features/warehouses/utils/location-code";

export const warehouseService = {
  listWarehouses(tenantId: string) {
    return warehouseRepository.listByTenant(tenantId);
  },

  async createWarehouse(input: {
    tenantId: string;
    actorUserId: string;
    code: string;
    name: string;
    isMain?: boolean;
  }) {
    const row = await warehouseRepository.create(input.tenantId, {
      code: input.code,
      name: input.name,
      isMain: input.isMain,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "warehouse.created",
      entityType: "Warehouse",
      entityId: row.id,
      metadata: { code: row.code, name: row.name },
    });

    return row;
  },

  async updateWarehouse(input: {
    tenantId: string;
    actorUserId: string;
    warehouseId: string;
    code?: string;
    name?: string;
    isMain?: boolean;
  }) {
    const row = await warehouseRepository.update(input.tenantId, input.warehouseId, {
      code: input.code,
      name: input.name,
      isMain: input.isMain,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "warehouse.updated",
      entityType: "Warehouse",
      entityId: row.id,
      metadata: { code: row.code, name: row.name },
    });

    return row;
  },

  async addLocation(input: {
    tenantId: string;
    actorUserId: string;
    warehouseId: string;
    code: string;
    name: string;
  }) {
    const warehouse = await warehouseRepository.findById(input.tenantId, input.warehouseId);
    if (!warehouse) throw new Error("Warehouse not found");
    if (warehouse.locations.some((location) => sameLocationCode(location.code, input.code))) {
      throw new Error(duplicateLocationCodeMessage(input.code));
    }

    let location: Awaited<ReturnType<typeof warehouseRepository.addLocation>>;
    try {
      location = await warehouseRepository.addLocation(input.warehouseId, {
        code: input.code.trim(),
        name: input.name.trim(),
      });
    } catch (e) {
      // Someone added the same code a moment ago: warehouse_locations_code_ci_uq caught it.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new Error(duplicateLocationCodeMessage(input.code));
      }
      throw e;
    }

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "warehouse.location_added",
      entityType: "WarehouseLocation",
      entityId: location.id,
      metadata: { warehouseCode: warehouse.code, locationCode: location.code },
    });

    return location;
  },

  async deleteLocation(input: {
    tenantId: string;
    actorUserId: string;
    warehouseId: string;
    locationId: string;
  }) {
    const warehouse = await warehouseRepository.findById(input.tenantId, input.warehouseId);
    if (!warehouse) throw new Error("Warehouse not found");

    const location = warehouse.locations.find((l) => l.id === input.locationId);
    if (!location) throw new Error("Location not found");

    await warehouseRepository.deleteLocation(input.warehouseId, input.locationId);

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "warehouse.location_deleted",
      entityType: "WarehouseLocation",
      entityId: input.locationId,
      metadata: { warehouseCode: warehouse.code, locationCode: location.code },
    });
  },
};
