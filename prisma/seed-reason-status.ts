import type { PrismaClient, ReasonStatusCategory } from "@prisma/client";

import {
  LEGACY_INVENTORY_STATUS_TO_CODE,
  REASON_STATUS_DEFAULTS,
} from "@/features/reason-status/constants/defaults";

export type ReasonStatusCodeMap = Record<string, Record<string, string>>;

/** Seed Reason/Status groups and codes for a tenant. Returns code id lookup. */
export async function seedReasonStatusesForTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<ReasonStatusCodeMap> {
  const map: ReasonStatusCodeMap = {};

  for (const group of REASON_STATUS_DEFAULTS) {
    const reasonStatus = await prisma.reasonStatus.upsert({
      where: {
        tenantId_category_code: {
          tenantId,
          category: group.category,
          code: group.code,
        },
      },
      create: {
        tenantId,
        category: group.category,
        name: group.name,
        code: group.code,
      },
      update: { name: group.name },
    });

    map[group.category] ??= {};

    for (const codeDef of group.codes) {
      const codeRow = await prisma.reasonStatusCode.upsert({
        where: {
          tenantId_reasonStatusId_code: {
            tenantId,
            reasonStatusId: reasonStatus.id,
            code: codeDef.code,
          },
        },
        create: {
          tenantId,
          reasonStatusId: reasonStatus.id,
          code: codeDef.code,
          name: codeDef.name,
          sortOrder: codeDef.sortOrder,
          isSystem: true,
        },
        update: {
          name: codeDef.name,
          sortOrder: codeDef.sortOrder,
        },
      });

      map[group.category][codeDef.code] = codeRow.id;
    }
  }

  return map;
}

const LEGACY_DELIVERY_STATUS: Record<string, string> = {
  pending: "pending",
  accepted: "accepted",
  partial: "partial",
};

const LEGACY_TRANSFER_STATUS: Record<string, string> = {
  draft: "draft",
  pending_tl: "pending_tl",
  in_transit: "in_transit",
  completed: "completed",
  cancelled: "cancelled",
};

const LEGACY_PULLOUT_STATUS: Record<string, string> = {
  draft: "draft",
  pending_tl: "pending_tl",
  pending_logistics: "pending_logistics",
  completed: "completed",
  cancelled: "cancelled",
};

/** Backfill status_code_id from legacy enum columns (pre-migration drop). */
export async function backfillReasonStatusFks(
  prisma: PrismaClient,
  tenantId: string,
  codeMap: ReasonStatusCodeMap,
) {
  const inventoryRows = await prisma.$queryRaw<
    { id: string; status: string }[]
  >`SELECT id, status::text AS status FROM branch_inventories WHERE tenant_id = ${tenantId}`;

  for (const row of inventoryRows) {
    const code = LEGACY_INVENTORY_STATUS_TO_CODE[row.status] ?? "STK";
    const statusCodeId = codeMap.inventory_system[code];
    if (!statusCodeId) continue;
    await prisma.branchInventory.update({
      where: { id: row.id },
      data: { statusCodeId },
    });
  }

  const deliveries = await prisma.$queryRaw<
    { id: string; status: string }[]
  >`SELECT id, status::text AS status FROM branch_deliveries WHERE tenant_id = ${tenantId}`;

  for (const row of deliveries) {
    const code = LEGACY_DELIVERY_STATUS[row.status] ?? "pending";
    const statusCodeId = codeMap.delivery_workflow[code];
    if (!statusCodeId) continue;
    await prisma.branchDelivery.update({
      where: { id: row.id },
      data: { statusCodeId },
    });
  }

  const transfers = await prisma.$queryRaw<
    { id: string; status: string }[]
  >`SELECT id, status::text AS status FROM branch_transfers WHERE tenant_id = ${tenantId}`;

  for (const row of transfers) {
    const code = LEGACY_TRANSFER_STATUS[row.status] ?? "pending_tl";
    const statusCodeId = codeMap.transfer_workflow[code];
    if (!statusCodeId) continue;
    await prisma.branchTransfer.update({
      where: { id: row.id },
      data: { statusCodeId },
    });
  }

  const pullouts = await prisma.$queryRaw<
    { id: string; status: string }[]
  >`SELECT id, status::text AS status FROM branch_pullouts WHERE tenant_id = ${tenantId}`;

  for (const row of pullouts) {
    const code = LEGACY_PULLOUT_STATUS[row.status] ?? "pending_tl";
    const statusCodeId = codeMap.pullout_workflow[code];
    if (!statusCodeId) continue;
    await prisma.branchPullout.update({
      where: { id: row.id },
      data: { statusCodeId },
    });
  }
}

export async function getReasonStatusCodeId(
  prisma: PrismaClient,
  tenantId: string,
  category: ReasonStatusCategory,
  code: string,
): Promise<string> {
  const row = await prisma.reasonStatusCode.findFirst({
    where: {
      tenantId,
      code,
      recordStatus: "active",
      reasonStatus: { category },
    },
    select: { id: true },
  });

  if (!row) {
    throw new Error(`Missing reason status code: ${category}/${code}`);
  }

  return row.id;
}
