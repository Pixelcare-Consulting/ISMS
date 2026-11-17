import { SERIAL_SOLD_OR_RESERVED_AFTER_LOOKUP } from "@/features/inventory/services/inventory-serial-moves";
import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
import {
  resolveSaleableSerialPage,
  type SaleableSerialItem,
} from "@/features/sales/lib/saleable-serial-query";
import { assertSerialsNotFrozenInStockCount } from "@/features/stock-audit/services/stock-count-freeze";
import type { Prisma } from "@/lib/database/generated/prisma/client";
import { toPaginatedResult, type PaginatedResult } from "@/lib/shared/pagination";

/**
 * SC ledger moves for service center sales. Same rules as the branch helpers in
 * `inventory-serial-moves` / `inventory-sellable-guards`, applied to
 * `ServiceCenterInventory` at one SC location (the sale's stock source).
 */

type ScInventoryReader = Pick<Prisma.TransactionClient, "serviceCenterInventory">;
type ScInventoryTx = Pick<Prisma.TransactionClient, "serviceCenterInventory" | "$queryRaw">;

/** The unit is STK at this SC location and matches the line's model when one is expected. */
export async function assertScSerialSellable(
  db: ScInventoryReader,
  input: {
    tenantId: string;
    serialNumberId: string;
    serviceCenterLocationId: string;
    stkCodeId: string;
    expectedModelId?: string;
  },
): Promise<void> {
  const row = await db.serviceCenterInventory.findFirst({
    where: {
      tenantId: input.tenantId,
      serialNumberId: input.serialNumberId,
      serviceCenterLocationId: input.serviceCenterLocationId,
    },
    select: {
      statusCodeId: true,
      statusCode: { select: { code: true } },
      serialNumber: { select: { serialNo: true, modelId: true } },
    },
  });

  const serialLabel = row?.serialNumber.serialNo ?? "Serial";
  if (!row || row.statusCodeId !== input.stkCodeId) {
    if (row?.statusCode?.code === "DEF") {
      throw new Error(`${serialLabel} is defective (DEF) and cannot be sold or reserved`);
    }
    throw new Error(`${serialLabel} is not in sellable stock at this service center location`);
  }
  if (input.expectedModelId && row.serialNumber.modelId !== input.expectedModelId) {
    throw new Error(`${serialLabel} does not match the selected model`);
  }
}

/** STK at the SC location → SLD / RSV. The unit stays on that location's ledger row. */
export async function markScSerialSold(
  tx: ScInventoryTx,
  input: {
    tenantId: string;
    serialNumberId: string;
    serviceCenterLocationId: string;
    stkCodeId: string;
    targetStatusCodeId: string;
    expectedModelId?: string;
  },
): Promise<void> {
  await lockSerialNumbers(tx, [input.serialNumberId]);
  await assertScSerialSellable(tx, input);
  await assertSerialsNotFrozenInStockCount(input.tenantId, [input.serialNumberId]);

  const updated = await tx.serviceCenterInventory.updateMany({
    where: {
      tenantId: input.tenantId,
      serialNumberId: input.serialNumberId,
      serviceCenterLocationId: input.serviceCenterLocationId,
      statusCodeId: input.stkCodeId,
    },
    data: { statusCodeId: input.targetStatusCodeId },
  });
  if (updated.count === 0) {
    throw new Error(SERIAL_SOLD_OR_RESERVED_AFTER_LOOKUP);
  }
}

/** SLD ↔ RSV on a sold SC unit (header Reserved toggle). Units in another status are left alone. */
export async function moveScSoldSerialStatus(
  tx: ScInventoryReader,
  input: {
    tenantId: string;
    serialNumberId: string;
    fromCodeId: string;
    toCodeId: string;
  },
): Promise<void> {
  await tx.serviceCenterInventory.updateMany({
    where: {
      tenantId: input.tenantId,
      serialNumberId: input.serialNumberId,
      statusCodeId: input.fromCodeId,
    },
    data: { statusCodeId: input.toCodeId },
  });
}

/** STK serials of one model at one SC location, paged like branch saleable serials. */
export async function queryScSaleableSerials(
  db: ScInventoryReader,
  input: {
    tenantId: string;
    serviceCenterLocationId: string;
    modelId?: string | null;
    search?: string | null;
    page?: number;
    limit?: number;
    stkCodeId: string;
  },
): Promise<PaginatedResult<SaleableSerialItem>> {
  const page = resolveSaleableSerialPage(input);
  const modelId = input.modelId?.trim() ?? "";
  if (!modelId) {
    return toPaginatedResult<SaleableSerialItem>([], 0, page.page, page.limit);
  }

  const search = input.search?.trim() ?? "";
  const where: Prisma.ServiceCenterInventoryWhereInput = {
    tenantId: input.tenantId,
    serviceCenterLocationId: input.serviceCenterLocationId,
    statusCodeId: input.stkCodeId,
    serialNumber: {
      modelId,
      ...(search ? { serialNo: { contains: search, mode: "insensitive" as const } } : {}),
    },
  };

  const [total, rows] = await Promise.all([
    db.serviceCenterInventory.count({ where }),
    db.serviceCenterInventory.findMany({
      where,
      select: {
        serialNumber: {
          select: {
            id: true,
            serialNo: true,
            modelId: true,
            model: { select: { skuCode: true, name: true } },
          },
        },
      },
      orderBy: [{ serialNumber: { serialNo: "asc" } }, { id: "asc" }],
      skip: page.skip,
      take: page.take,
    }),
  ]);

  return toPaginatedResult(
    rows.map((row) => ({
      id: row.serialNumber.id,
      serialNo: row.serialNumber.serialNo,
      modelId: row.serialNumber.modelId,
      skuCode: row.serialNumber.model.skuCode,
      modelName: row.serialNumber.model.name,
    })),
    total,
    page.page,
    page.limit,
  );
}
