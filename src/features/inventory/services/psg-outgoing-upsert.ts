import type { PrismaClient } from "@/lib/database/generated/prisma/client";
import type { PsgOutgoingRow } from "@/features/inventory/services/psg-outgoing-workbook";

type SeedPrisma = Pick<
  PrismaClient,
  "warehouse" | "branch" | "productModel" | "serialNumber" | "branchInventory"
>;

export interface UpsertPsgOutgoingResult {
  warehouseId: string;
  warehouseCode: string;
  serialsUpserted: number;
  inventoriesUpserted: number;
  skippedMissingBranch: number;
  skippedMissingModel: number;
  skippedEmptyTarget: number;
}

const CHUNK = 40;

/**
 * Ensure warehouse FWH14P1F (isMain only if tenant has no main yet), then upsert
 * SerialNumber + BranchInventory (STK) for each Outgoing row.
 * Skips + counts rows with missing branch sapCode or model skuCode.
 */
export async function upsertPsgOutgoing(
  prisma: SeedPrisma,
  tenantId: string,
  rows: PsgOutgoingRow[],
  stkStatusCodeId: string,
): Promise<UpsertPsgOutgoingResult> {
  if (!stkStatusCodeId) {
    throw new Error(
      "Inventory STK status code is required. Run `pnpm run db:seed:status` (or ensure seedReasonStatusesForTenant ran).",
    );
  }

  const warehouseCodes = [
    ...new Set(
      rows
        .map((row) => row.fromWarehouseCode.trim())
        .filter((code) => Boolean(code)),
    ),
  ];
  const primaryCode = warehouseCodes[0] ?? "FWH14P1F";

  const existingMain = await prisma.warehouse.findFirst({
    where: { tenantId, isMain: true },
    select: { id: true },
  });

  const warehouse = await prisma.warehouse.upsert({
    where: { tenantId_code: { tenantId, code: primaryCode } },
    create: {
      tenantId,
      code: primaryCode,
      name: primaryCode,
      isMain: !existingMain,
    },
    update: {},
    select: { id: true, code: true },
  });

  for (const code of warehouseCodes) {
    if (code === primaryCode) continue;
    await prisma.warehouse.upsert({
      where: { tenantId_code: { tenantId, code } },
      create: {
        tenantId,
        code,
        name: code,
        isMain: false,
      },
      update: {},
    });
  }

  const branches = await prisma.branch.findMany({
    where: { tenantId },
    select: { id: true, sapCode: true },
  });
  const branchIdBySap = new Map(
    branches.map((b) => [b.sapCode.toLowerCase(), b.id]),
  );

  const models = await prisma.productModel.findMany({
    where: { tenantId },
    select: { id: true, skuCode: true },
  });
  const modelIdBySku = new Map(
    models.map((m) => [m.skuCode.toLowerCase(), m.id]),
  );

  let serialsUpserted = 0;
  let inventoriesUpserted = 0;
  let skippedMissingBranch = 0;
  let skippedMissingModel = 0;
  let skippedEmptyTarget = 0;
  const warnedBranches = new Set<string>();
  const warnedModels = new Set<string>();

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);

    for (const row of chunk) {
      const sap = row.toBranchSapCode.trim();
      const sku = row.skuCode.trim();

      if (!sap || !sku) {
        skippedEmptyTarget += 1;
        continue;
      }

      const branchId = branchIdBySap.get(sap.toLowerCase());
      if (!branchId) {
        skippedMissingBranch += 1;
        if (!warnedBranches.has(sap.toLowerCase())) {
          warnedBranches.add(sap.toLowerCase());
          console.warn(
            `  Outgoing skip: branch sapCode "${sap}" not found (row ${row.sourceRowNumber})`,
          );
        }
        continue;
      }

      const modelId = modelIdBySku.get(sku.toLowerCase());
      if (!modelId) {
        skippedMissingModel += 1;
        if (!warnedModels.has(sku.toLowerCase())) {
          warnedModels.add(sku.toLowerCase());
          console.warn(
            `  Outgoing skip: model skuCode "${sku}" not found (row ${row.sourceRowNumber})`,
          );
        }
        continue;
      }

      const sn = await prisma.serialNumber.upsert({
        where: { tenantId_serialNo: { tenantId, serialNo: row.serialNo } },
        create: {
          tenantId,
          modelId,
          serialNo: row.serialNo,
          recordStatus: "active",
        },
        update: {
          modelId,
          recordStatus: "active",
        },
        select: { id: true },
      });
      serialsUpserted += 1;

      const stockedAt = row.date ?? undefined;

      await prisma.branchInventory.upsert({
        where: {
          branchId_serialNumberId: {
            branchId,
            serialNumberId: sn.id,
          },
        },
        create: {
          tenantId,
          branchId,
          serialNumberId: sn.id,
          statusCodeId: stkStatusCodeId,
          ...(stockedAt ? { createdAt: stockedAt, updatedAt: stockedAt } : {}),
        },
        update: {
          statusCodeId: stkStatusCodeId,
          ...(stockedAt ? { updatedAt: stockedAt } : {}),
        },
      });
      inventoriesUpserted += 1;
    }
  }

  if (skippedMissingBranch > 0 || skippedMissingModel > 0) {
    console.warn(
      `  Outgoing skipped: ${skippedMissingBranch} missing branch, ${skippedMissingModel} missing model` +
        (skippedEmptyTarget ? `, ${skippedEmptyTarget} empty TO WH/MODEL` : ""),
    );
  }

  return {
    warehouseId: warehouse.id,
    warehouseCode: warehouse.code,
    serialsUpserted,
    inventoriesUpserted,
    skippedMissingBranch,
    skippedMissingModel,
    skippedEmptyTarget,
  };
}
