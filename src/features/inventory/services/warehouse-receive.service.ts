import { auditService } from "@/features/audit/services/audit.service";
import {
  LOCAL_FIXTURE_SYSTEM_STATUS,
  sapStockPlacementRepository,
} from "@/features/inventory/repositories/sap-stock-placement.repository";
import {
  isIsolatedSapTestCompany,
  newWarehouseSerialIds,
} from "@/features/inventory/services/warehouse-receive.rules";
import { prisma } from "@/lib/database/client";

export { isIsolatedSapTestCompany, newWarehouseSerialIds };

/**
 * Explicit warehouse receive. This is the only writer that places units into
 * warehouse stock. Serial sync does not call it, and it never creates branch
 * stock or planogram rows.
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

  const model = await prisma.productModel.findFirst({
    where: { id: input.modelId, tenantId: input.tenantId, deletedAt: null },
    select: { id: true, skuCode: true },
  });
  if (!model) throw new Error("Model not found for warehouse receive");

  const existingSerials = await prisma.serialNumber.findMany({
    where: { tenantId: input.tenantId, serialNo: { in: serialNos } },
    select: { id: true, serialNo: true, modelId: true, deletedAt: true },
  });
  const byNo = new Map(existingSerials.map((row) => [row.serialNo, row]));

  for (const serialNo of serialNos) {
    const row = byNo.get(serialNo);
    if (row && row.modelId !== model.id) {
      throw new Error(`${serialNo} already belongs to a different model`);
    }
    if (row?.deletedAt) {
      throw new Error(`${serialNo} is retired and cannot be received`);
    }
  }

  const missing = serialNos.filter((serialNo) => !byNo.has(serialNo));
  if (missing.length > 0) {
    await prisma.serialNumber.createMany({
      data: missing.map((serialNo) => ({
        tenantId: input.tenantId,
        serialNo,
        modelId: model.id,
        createdById: input.userId,
      })),
      skipDuplicates: true,
    });
  }

  const serials = await prisma.serialNumber.findMany({
    where: { tenantId: input.tenantId, serialNo: { in: serialNos }, deletedAt: null },
    select: { id: true, serialNo: true },
  });
  if (serials.length !== serialNos.length) {
    throw new Error("Warehouse receive could not register every serial");
  }

  const alreadyThere = await prisma.warehouseInventory.findMany({
    where: { tenantId: input.tenantId, serialNumberId: { in: serials.map((row) => row.id) } },
    select: { serialNumberId: true },
  });
  const freshIds = newWarehouseSerialIds(
    alreadyThere.map((row) => row.serialNumberId),
    serials.map((row) => row.id),
  );

  const seenAt = new Date();
  const created = await sapStockPlacementRepository.createWarehouseUnits(
    input.tenantId,
    location.id,
    freshIds,
    seenAt,
    LOCAL_FIXTURE_SYSTEM_STATUS,
  );
  const skipped = serialNos.length - created;

  if (created > 0) {
    await prisma.serialNumberHistory.createMany({
      data: serials
        .filter((row) => freshIds.includes(row.id))
        .map((row) => ({
          tenantId: input.tenantId,
          serialNumberId: row.id,
          txnType: "grpo" as const,
          details: `Received into ${warehouse.code} from a local fixture`,
          status: "Warehouse",
          createdById: input.userId,
        })),
    });
  }

  await auditService.log({
    tenantId: input.tenantId,
    userId: input.userId ?? undefined,
    action: "warehouse.received",
    entityType: "Warehouse",
    entityId: warehouse.id,
    metadata: {
      source: LOCAL_SAP_FIXTURE_SOURCE,
      warehouseCode: warehouse.code,
      skuCode: model.skuCode,
      created,
      skipped,
      serialNos,
      liveSapUnverified: true,
    },
  });

  return {
    source: LOCAL_SAP_FIXTURE_SOURCE,
    created,
    skipped,
    liveSapUnverified: true,
    message:
      created === 0
        ? "Those serials are already in the warehouse. Nothing new was added."
        : `Received ${created} ${created === 1 ? "serial" : "serials"} into the warehouse from a local fixture. Live SAP was not used.`,
  };
}
