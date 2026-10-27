import type { BranchOrderType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import {
  countSerialsAlreadyStk,
  outstandingByModel,
  type DitSerialInput,
  type OutstandingLineInput,
} from "@/features/orders/lib/suggestion-apply-decisions";
import { planningPoolKey, shelfPoolKey } from "@/features/orders/lib/suggestion-qty";
import { nextSalesOrderNumber } from "@/features/orders/utils/next-sales-order-number";

export type SuggestionDb = Prisma.TransactionClient;

export function suggestionDb(tx?: Prisma.TransactionClient): SuggestionDb {
  return (tx ?? prisma) as SuggestionDb;
}

const CLOSED_ORDER_STATUSES = ["rejected", "cancelled"] as const;

export async function lockSuggestionKey(db: SuggestionDb, key: string): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)`;
}

export function draftLockKey(tenantId: string, branchId: string, orderType: BranchOrderType): string {
  return ["suggestion-draft", tenantId, branchId, orderType].join("|");
}

export function planningLockKey(input: {
  tenantId: string;
  periodId: string;
  branchId: string;
  modelId: string;
  orderType: BranchOrderType;
}): string {
  return `${input.tenantId}|${planningPoolKey(input)}`;
}

export function shelfLockKey(input: {
  tenantId: string;
  branchId: string;
  modelId: string;
  orderType: BranchOrderType;
}): string {
  return `${input.tenantId}|${shelfPoolKey(input)}`;
}

export async function lockKeysInOrder(db: SuggestionDb, keys: readonly string[]): Promise<void> {
  const unique = [...new Set(keys)].sort((a, b) => a.localeCompare(b));
  for (const key of unique) {
    await lockSuggestionKey(db, key);
  }
}

export type OpenDraftDetail = {
  id: string;
  modelId: string;
  quantity: number;
  suggestionAllocation: {
    allocatedQty: number;
    sourceQty: number;
    sourceKind: string;
  } | null;
};

export type OpenDraft = {
  id: string;
  orderNumber: string;
  details: OpenDraftDetail[];
};

export async function findOpenDraft(
  db: SuggestionDb,
  tenantId: string,
  branchId: string,
  orderType: BranchOrderType,
): Promise<OpenDraft | null> {
  return db.branchOrder.findFirst({
    where: { tenantId, branchId, orderType, status: "draft" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      details: {
        select: {
          id: true,
          modelId: true,
          quantity: true,
          suggestionAllocation: {
            select: { allocatedQty: true, sourceQty: true, sourceKind: true },
          },
        },
      },
    },
  });
}

export type ReleasedPlanningContext = {
  periodId: string;
  periodLabel: string;
  runId: string;
  documentNumber: string;
  lines: {
    modelId: string;
    skuCode: string;
    description: string;
    onHandQty: number;
    releasedDrop1Qty: number;
  }[];
};

export async function findReleasedPlanning(
  db: SuggestionDb,
  tenantId: string,
  branchId: string,
): Promise<ReleasedPlanningContext | null> {
  const period = await db.planningPeriod.findFirst({
    where: { tenantId, isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true, label: true },
  });
  if (!period) return null;

  const run = await db.demandPlanningRun.findFirst({
    where: {
      tenantId,
      periodId: period.id,
      status: "released",
      branches: { some: { branchId } },
    },
    orderBy: [{ releasedAt: "desc" }, { version: "desc" }],
    select: { id: true, documentNumber: true },
  });
  if (!run) return null;

  const lines = await db.demandPlanningLine.findMany({
    where: {
      tenantId,
      runId: run.id,
      releasedDrop1Qty: { gt: 0 },
      runBranch: { branchId },
    },
    orderBy: { skuCode: "asc" },
    select: {
      modelId: true,
      skuCode: true,
      onHandQty: true,
      releasedDrop1Qty: true,
      model: { select: { name: true, skuCode: true } },
    },
  });

  return {
    periodId: period.id,
    periodLabel: period.label,
    runId: run.id,
    documentNumber: run.documentNumber,
    lines: lines.flatMap((line) => {
      if (line.releasedDrop1Qty == null) return [];
      return [
        {
          modelId: line.modelId,
          skuCode: line.model.skuCode || line.skuCode,
          description: line.model.name,
          onHandQty: line.onHandQty,
          releasedDrop1Qty: line.releasedDrop1Qty,
        },
      ];
    }),
  };
}

export async function sumPlanningCoverage(
  db: SuggestionDb,
  input: {
    tenantId: string;
    branchId: string;
    periodId: string;
    periodLabel: string;
    documentNumber: string;
    modelIds: string[];
  },
): Promise<Map<string, { allocatedQty: number; legacyUnallocatedQty: number }>> {
  const result = new Map<string, { allocatedQty: number; legacyUnallocatedQty: number }>();
  for (const modelId of input.modelIds) {
    result.set(modelId, { allocatedQty: 0, legacyUnallocatedQty: 0 });
  }
  if (input.modelIds.length === 0) return result;

  const [allocations, legacyLines] = await Promise.all([
    db.orderSuggestionAllocation.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        periodId: input.periodId,
        orderType: "auto_replenish",
        sourceKind: "planning_drop1",
        modelId: { in: input.modelIds },
        orderDetail: {
          order: { status: { notIn: [...CLOSED_ORDER_STATUSES] } },
        },
      },
      select: { modelId: true, allocatedQty: true },
    }),
    db.branchOrderDetail.findMany({
      where: {
        modelId: { in: input.modelIds },
        suggestionAllocation: { is: null },
        order: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          orderType: "auto_replenish",
          status: { notIn: [...CLOSED_ORDER_STATUSES] },
          OR: [
            { notes: { contains: `(${input.periodLabel})`, mode: "insensitive" } },
            { notes: { contains: input.documentNumber, mode: "insensitive" } },
          ],
        },
      },
      select: { modelId: true, quantity: true },
    }),
  ]);

  for (const row of allocations) {
    const current = result.get(row.modelId);
    if (!current) continue;
    current.allocatedQty += row.allocatedQty;
  }
  for (const row of legacyLines) {
    const current = result.get(row.modelId);
    if (!current) continue;
    current.legacyUnallocatedQty += row.quantity;
  }
  return result;
}

type DeliveryLineRow = {
  serialNumber: {
    modelId: string;
    branchInventories: { statusCodeId: string }[];
  };
};

type OrderLineRow = {
  modelId: string;
  quantity: number;
  order: {
    deliveries: { id: string; lines: DeliveryLineRow[] }[];
  };
};

function toOutstandingLine(row: OrderLineRow, stkCodeId: string | null): OutstandingLineInput {
  const deliveryIds = row.order.deliveries.map((delivery) => delivery.id);
  const deliveryLines = row.order.deliveries.flatMap((delivery) =>
    delivery.lines.map((line) => ({
      serialModelId: line.serialNumber.modelId,
      statusCodeId: line.serialNumber.branchInventories[0]?.statusCodeId ?? null,
    })),
  );
  return {
    modelId: row.modelId,
    lineQty: row.quantity,
    serialsAlreadyStk: countSerialsAlreadyStk({
      modelId: row.modelId,
      stkCodeId,
      deliveryLines,
    }),
    deliveryIds,
  };
}

export async function loadOutstandingByModel(
  db: SuggestionDb,
  input: {
    tenantId: string;
    branchId: string;
    modelIds: string[];
    stkCodeId: string | null;
    ditCodeId: string | null;
  },
): Promise<Map<string, number>> {
  if (input.modelIds.length === 0) return new Map();

  const orderLines = await db.branchOrderDetail.findMany({
    where: {
      modelId: { in: input.modelIds },
      order: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        status: { notIn: [...CLOSED_ORDER_STATUSES] },
      },
    },
    select: {
      modelId: true,
      quantity: true,
      order: {
        select: {
          deliveries: {
            select: {
              id: true,
              lines: {
                select: {
                  serialNumber: {
                    select: {
                      modelId: true,
                      branchInventories: {
                        where: { tenantId: input.tenantId, branchId: input.branchId },
                        select: { statusCodeId: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const ditSerials: DitSerialInput[] = [];
  if (input.ditCodeId) {
    const ditRows = await db.branchInventory.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        statusCodeId: input.ditCodeId,
        serialNumber: { modelId: { in: input.modelIds } },
      },
      select: {
        serialNumber: {
          select: {
            modelId: true,
            deliveryLines: { select: { deliveryId: true } },
          },
        },
      },
    });
    for (const row of ditRows) {
      ditSerials.push({
        modelId: row.serialNumber.modelId,
        deliveryIds: row.serialNumber.deliveryLines.map((line) => line.deliveryId),
      });
    }
  }

  return outstandingByModel({
    lines: orderLines.map((row) => toOutstandingLine(row, input.stkCodeId)),
    ditSerials,
  });
}

export async function countStkByModel(
  db: SuggestionDb,
  input: {
    tenantId: string;
    branchId: string;
    modelIds: string[];
    stkCodeId: string | null;
  },
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const modelId of input.modelIds) counts.set(modelId, 0);
  if (!input.stkCodeId || input.modelIds.length === 0) return counts;

  const rows = await db.branchInventory.findMany({
    where: {
      tenantId: input.tenantId,
      branchId: input.branchId,
      statusCodeId: input.stkCodeId,
      serialNumber: { modelId: { in: input.modelIds } },
    },
    select: { serialNumber: { select: { modelId: true } } },
  });
  for (const row of rows) {
    const modelId = row.serialNumber.modelId;
    counts.set(modelId, (counts.get(modelId) ?? 0) + 1);
  }
  return counts;
}

export async function nextDraftOrderNumber(
  db: SuggestionDb,
  tenantId: string,
  now = new Date(),
): Promise<string> {
  return nextSalesOrderNumber(tenantId, { db, now });
}
