import type { PrismaClient } from "@/lib/database/generated/prisma/client";
import { parsePsgModelWorkbookFromPath } from "@/features/master-data/services/psg-model-workbook";
import { upsertPsgModels } from "@/features/master-data/services/psg-model-upsert";
import { parsePsgOutgoingWorkbookFromPath } from "@/features/inventory/services/psg-outgoing-workbook";
import { upsertPsgOutgoing } from "@/features/inventory/services/psg-outgoing-upsert";
import {
  getReasonStatusCodeId,
  seedReasonStatusesForTenant,
  type ReasonStatusCodeMap,
} from "./seed-reason-status";

type SeedPrisma = PrismaClient;

async function resolveStkCodeId(
  prisma: SeedPrisma,
  tenantId: string,
  statusCodes?: ReasonStatusCodeMap,
): Promise<string> {
  const fromMap = statusCodes?.inventory_system?.STK;
  if (fromMap) return fromMap;
  return getReasonStatusCodeId(prisma, tenantId, "inventory_system", "STK");
}

/**
 * Seed PSG MODEL catalog (all tenants) + Outgoing serial stock (demo tenant only).
 * Prerequisite for Outgoing: branches with matching sapCodes (`db:seed:branches`).
 */
export async function seedPsgModelAndOutgoing(prisma: SeedPrisma): Promise<void> {
  const modelParsed = await parsePsgModelWorkbookFromPath();
  console.log(
    `  PSG MODEL sheet "${modelParsed.sheetName}": ${modelParsed.rows.length} SKUs` +
      ` (skipped empty: ${modelParsed.skippedEmptySku}, duplicate sku last-wins: ${modelParsed.duplicateSkuCount})`,
  );

  if (modelParsed.duplicateSkuCount > 0) {
    console.warn(
      `  Warning: ${modelParsed.duplicateSkuCount} duplicate Item No/ row(s); last non-empty row wins.`,
    );
  }

  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  if (tenants.length === 0) {
    throw new Error("No tenants found. Run `pnpm run db:seed:core` first.");
  }

  for (const tenant of tenants) {
    const result = await upsertPsgModels(prisma, tenant.id, modelParsed.rows);
    console.log(
      `  Models [${tenant.slug}]: +${result.modelsCreated} created, ${result.modelsUpdated} updated,` +
        ` ${result.brandsUpserted} brands, ${result.categoriesUpserted} categories`,
    );
  }

  const demoTenant = tenants.find((t) => t.slug === "demo");
  if (!demoTenant) {
    throw new Error('Demo tenant not found. Run `pnpm run db:seed:core` first.');
  }

  const statusCodes = await seedReasonStatusesForTenant(prisma, demoTenant.id);
  const stkStatusCodeId = await resolveStkCodeId(prisma, demoTenant.id, statusCodes);
  if (!stkStatusCodeId) {
    throw new Error(
      "Inventory STK status code missing after seeding reason statuses. Check seed-reason-status defaults.",
    );
  }

  const outgoingParsed = await parsePsgOutgoingWorkbookFromPath();
  console.log(
    `  PSG Outgoing sheet "${outgoingParsed.sheetName}": ${outgoingParsed.rows.length} serials` +
      ` (skipped empty: ${outgoingParsed.skippedEmptySerial}, duplicate SN last-wins: ${outgoingParsed.duplicateSerialCount})`,
  );

  if (outgoingParsed.duplicateSerialCount > 0) {
    console.warn(
      `  Warning: ${outgoingParsed.duplicateSerialCount} duplicate SERIALNO/ row(s); last non-empty row wins.`,
    );
  }

  const outgoing = await upsertPsgOutgoing(
    prisma,
    demoTenant.id,
    outgoingParsed.rows,
    stkStatusCodeId,
  );

  console.log(
    `  Outgoing [demo]: warehouse ${outgoing.warehouseCode},` +
      ` ${outgoing.serialsUpserted} serials, ${outgoing.inventoriesUpserted} branch inventory rows` +
      ` (skipped branch=${outgoing.skippedMissingBranch}, model=${outgoing.skippedMissingModel})`,
  );
}
