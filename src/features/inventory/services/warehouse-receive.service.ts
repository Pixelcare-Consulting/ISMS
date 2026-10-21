import { auditService } from "@/features/audit/services/audit.service";
import { LOCAL_FIXTURE_SYSTEM_STATUS } from "@/features/inventory/repositories/sap-stock-placement.repository";
import { isIsolatedSapTestCompany } from "@/features/inventory/services/warehouse-receive.rules";
import { commitWarehousePlacement } from "@/features/inventory/services/warehouse-placement-commit";
import { prisma } from "@/lib/database/client";

export { isIsolatedSapTestCompany };

/**
 * Explicit warehouse receive for a labeled local fixture (or a live isolated
 * test company). Location stock-in is the other writer that places units into
 * warehouse stock. Serial sync does not call either path, and neither creates
 * branch stock or planogram rows.
 *
 * Live SAP placement runs only when Service Layer is enabled for an isolated
 * test company. A duplicated or production company is left untouched. The demo
 * uses the labeled local fixture instead.
 */
export const LOCAL_SAP_FIXTURE_SOURCE = "local-sap-fixture" as const;

export type WarehouseReceiveSource = typeof LOCAL_SAP_FIXTURE_SOURCE | "sap";

export interface WarehouseReceiveResult {
  source: WarehouseReceiveSource;
  created: number;
  skipped: number;
  /** True when Service Layer was not used to place these units. */
  liveSapUnverified: boolean;
  message: string;
}

export interface ReceiveFixtureInput {
  tenantId: string;
  userId: string | null;
  warehouseCode: string;
  locationCode: string;
  modelId: string;
  serialNos: string[];
}

/**
 * Place an audited local fixture through the warehouse writer.
 * The warehouse and location must already exist. This does not create them,
 * and it does not create branch stock.
 */
export async function receiveLocalSapFixture(
  input: ReceiveFixtureInput,
): Promise<WarehouseReceiveResult> {
  const serialNos = [...new Set(input.serialNos.map((serial) => serial.trim()).filter(Boolean))];
  if (serialNos.length === 0) {
    throw new Error("Warehouse receive needs at least one serial");
  }

  const warehouse = await prisma.warehouse.findFirst({
    where: { tenantId: input.tenantId, code: input.warehouseCode, deletedAt: null },
    select: { id: true, code: true },
  });
  if (!warehouse) {
    throw new Error(
      `Warehouse ${input.warehouseCode} does not exist. Create the warehouse before receiving stock.`,
    );
  }

  const location = await prisma.warehouseLocation.findFirst({
    where: { warehouseId: warehouse.id, code: input.locationCode },
    select: { id: true },
  });
  if (!location) {
    throw new Error(
      `Location ${input.locationCode} does not exist in ${input.warehouseCode}. Create the location before receiving stock.`,
    );
  }

  const placed = await commitWarehousePlacement({
    tenantId: input.tenantId,
    userId: input.userId,
    warehouseId: warehouse.id,
    locationId: location.id,
    modelId: input.modelId,
    serialNos,
    systemStatus: LOCAL_FIXTURE_SYSTEM_STATUS,
    historyStatus: "Warehouse",
    historyDetails: ({ warehouseCode }) => `Received into ${warehouseCode} from a local fixture`,
  });

  await auditService.log({
    tenantId: input.tenantId,
    userId: input.userId ?? undefined,
    action: "warehouse.received",
    entityType: "Warehouse",
    entityId: warehouse.id,
    metadata: {
      source: LOCAL_SAP_FIXTURE_SOURCE,
      warehouseCode: warehouse.code,
      skuCode: placed.skuCode,
      created: placed.created,
      skipped: placed.skipped,
      serialNos: placed.serialNos,
      liveSapUnverified: true,
    },
  });

  return {
    source: LOCAL_SAP_FIXTURE_SOURCE,
    created: placed.created,
    skipped: placed.skipped,
    liveSapUnverified: true,
    message:
      placed.created === 0
        ? "Those serials are already in this location. Nothing new was added."
        : `Received ${placed.created} ${placed.created === 1 ? "serial" : "serials"} into the warehouse from a local fixture. Live SAP was not used.`,
  };
}
