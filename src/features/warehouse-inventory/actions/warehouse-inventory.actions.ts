"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  moveTaggedSerial,
  moveWarehouseUnit,
} from "@/features/inventory/services/branch-stock-location.service";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import {
  warehouseInventoryService,
  type WarehouseFilterOption,
  type WarehouseLocationFilterOption,
} from "@/features/warehouse-inventory/services/warehouse-inventory.service";
import {
  hasPermission,
  requireAnyPermission,
  requirePermission,
} from "@/lib/auth/permissions";
import type { PaginatedResult } from "@/lib/shared/pagination";

const WAREHOUSE_STOCK_PERMISSIONS = [
  "inventory.view",
  "warehouses.manage",
] as const;

/** DTO row for the Warehouse stock list (ISO dates). */
export type WarehouseInventoryListItem = {
  id: string;
  source: "WAREHOUSE" | "BRANCH";
  branch: { name: string; sapCode: string | null } | null;
  systemStatus: string | null;
  updatedAt: string;
  serialNumber: {
    id: string;
    serialNo: string;
    model: {
      sku: string;
      name: string;
      brand: { name: string };
    };
  };
  warehouse: { id: string; code: string; name: string };
  location: { id: string; code: string; name: string };
};

function isUnrestricted(permissions: string[] | undefined) {
  return (
    hasPermission(permissions, "warehouses.manage") ||
    hasPermission(permissions, "master_data.manage")
  );
}

export async function listWarehouseInventoryAction(input?: {
  page?: number;
  limit?: number;
  warehouseId?: string;
  locationId?: string;
  q?: string;
}): Promise<PaginatedResult<WarehouseInventoryListItem>> {
  const session = await requireAnyPermission([...WAREHOUSE_STOCK_PERMISSIONS]);
  const unrestricted = isUnrestricted(session.user.permissions);
  const limit = parseTablePageSize(input?.limit);

  const result = await warehouseInventoryService.listForUser(
    session.user.tenantId,
    session.user.id,
    unrestricted,
    { page: input?.page, limit },
    {
      warehouseId: input?.warehouseId,
      locationId: input?.locationId,
      q: input?.q,
    },
  );

  return {
    ...result,
    items: result.items.map(
      (row): WarehouseInventoryListItem => ({
        id: row.id,
        source: row.source,
        branch: row.branch,
        systemStatus: row.systemStatus,
        updatedAt: row.updatedAt.toISOString(),
        serialNumber: {
          id: row.serialNumber.id,
          serialNo: row.serialNumber.serialNo,
          model: {
            sku: row.serialNumber.model.skuCode,
            name: row.serialNumber.model.name,
            brand: row.serialNumber.model.brand ?? { name: "—" },
          },
        },
        warehouse: row.warehouseLocation.warehouse,
        location: {
          id: row.warehouseLocation.id,
          code: row.warehouseLocation.code,
          name: row.warehouseLocation.name,
        },
      }),
    ),
  };
}

export async function listWarehouseFilterOptionsAction(input?: {
  warehouseId?: string;
}): Promise<{
  warehouses: WarehouseFilterOption[];
  locations: WarehouseLocationFilterOption[];
}> {
  const session = await requireAnyPermission([...WAREHOUSE_STOCK_PERMISSIONS]);
  const unrestricted = isUnrestricted(session.user.permissions);
  return warehouseInventoryService.listFilterOptions(
    session.user.tenantId,
    session.user.id,
    unrestricted,
    input?.warehouseId,
  );
}

const editLocationSchema = z.object({
  source: z.enum(["WAREHOUSE", "BRANCH"]),
  id: z.string().min(1),
  locationId: z.string().min(1),
});

/** Move a located serial to another location of the same warehouse. */
export async function editWarehouseStockLocationAction(input: unknown) {
  const session = await requirePermission("warehouses.manage");
  const parsed = editLocationSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose the new location." };
  const base = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    locationId: parsed.data.locationId,
  };
  try {
    const result =
      parsed.data.source === "BRANCH"
        ? await moveTaggedSerial({ ...base, branchInventoryId: parsed.data.id })
        : await moveWarehouseUnit({ ...base, warehouseInventoryId: parsed.data.id });
    revalidatePath("/inventory/warehouse-stock");
    return { success: true as const, ...result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not change the location." };
  }
}
