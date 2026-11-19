"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { auditService } from "@/features/audit/services/audit.service";
import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { isToFollowSerial, TO_FOLLOW_SERIAL_ID } from "@/features/sales/constants/to-follow-serial";
import {
  resolveSaleableSerialPage,
  type SaleableSerialItem,
} from "@/features/sales/lib/saleable-serial-query";
import type { SalesListSort } from "@/features/sales/repositories/sales.repository";
import { toSaleDetailsPayload } from "@/features/sales/services/sale-details-payload";
import {
  assertSaleHeaderLookups,
  assertSaleLookups,
  DUPLICATE_SALE_SERIAL_ERROR,
  hasDuplicateSaleSerials,
  isSaleReserved,
  priceSaleDetails,
  realSaleSerialIds,
  resolveLineDeliveryEdit,
  resolveReservedToggle,
  resolveSaleEncodeStatusCodes,
  saleDetailRowData,
  saleDetailSchema,
  saleHeaderCreateData,
  saleHeaderFieldsSchema,
  saleHeaderUpdateData,
  toDateInputValue,
  updateSaleSerialSchema,
} from "@/features/sales/services/sale-encode";
import { computeSalesKpis } from "@/features/sales/services/sales-kpi.service";
import { listSalesLines } from "@/features/sales/services/sales-list.service";
import {
  assertSerialLinkForSaleLine,
  claimToFollowSaleLine,
} from "@/features/sales/services/sale-serial-link";
import { capturesDeliveryReceipt } from "@/features/sales/utils/delivery-method";
import { saleHasOfficialSoldLine } from "@/features/sales/utils/sale-header-edit";
import { resolveSaleTransactionDate } from "@/features/sales/utils/transaction-date";
import {
  SC_SALES_ACCESS,
  SC_SALES_CREATE,
  SC_SALES_UPDATE,
} from "@/features/service-center-ops/constants/sc-permissions";
import {
  scLocationLabel,
  scSalesRepository,
} from "@/features/service-center-ops/repositories/sc-sales.repository";
import {
  assertScSerialSellable,
  markScSerialSold,
  moveScSoldSerialStatus,
  queryScSaleableSerials,
} from "@/features/service-center-ops/services/sc-sale-inventory";
import {
  assertScInScope,
  resolveScIdsForUser,
} from "@/features/service-center-ops/services/sc-scope";
import { requireAnyPermission, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";
import { toPaginatedResult, type PaginatedResult } from "@/lib/shared/pagination";

/**
 * Service center sales. Same encode, list, details, and edit behaviour as branch Sales
 * Transactions (shared `features/sales/services`); the sold place is a service center and
 * stock comes from one of its locations on the SC ledger.
 */

const SC_SALES_SORT_FIELDS = new Set<SalesListSort>([
  "transactionNo",
  "date",
  "branch",
  "customer",
  "amount",
  "atrStatus",
  "returnStatus",
]);

const scStockSourceSchema = z.object({
  serviceCenterId: z.string().min(1),
  serviceCenterLocationId: z.string().min(1),
});

const scSaleSchema = saleHeaderFieldsSchema.extend({
  ...scStockSourceSchema.shape,
  details: z.array(saleDetailSchema).min(1),
});

const updateScSaleHeaderSchema = saleHeaderFieldsSchema.extend({
  ...scStockSourceSchema.shape,
  saleId: z.string().min(1),
});

const TRANSACTION_NO_TAKEN =
  "Transaction number already used on this service center. Enter a different number.";

function revalidateScSales() {
  revalidatePath("/service-centers/sales");
  revalidatePath("/service-centers/sales/new");
  revalidatePath("/service-centers/inventory");
}

async function scScopeForSession(session: {
  user: { tenantId: string; id: string; permissions?: string[] };
}) {
  return resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
}

/** The location belongs to this active service center, which is in the user's scope. */
async function assertScStockSource(
  tenantId: string,
  scopedIds: string[] | null,
  input: { serviceCenterId: string; serviceCenterLocationId: string },
): Promise<void> {
  assertScInScope(input.serviceCenterId, scopedIds);
  const location = await prisma.serviceCenterLocation.findFirst({
    where: {
      id: input.serviceCenterLocationId,
      serviceCenterId: input.serviceCenterId,
      serviceCenter: { tenantId, deletedAt: null, status: "active" },
    },
    select: { id: true },
  });
  if (!location) {
    throw new Error("Stock source must be a location of the service center sold");
  }
}

async function isScTransactionNoTaken(input: {
  tenantId: string;
  serviceCenterId: string;
  transactionNo: string;
  exceptSaleId?: string;
}): Promise<boolean> {
  const taken = await prisma.serviceCenterSalesTransaction.findFirst({
    where: {
      tenantId: input.tenantId,
      serviceCenterId: input.serviceCenterId,
      transactionNo: input.transactionNo,
      ...(input.exceptSaleId ? { NOT: { id: input.exceptSaleId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(taken);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function listScSalesAction(input?: {
  page?: number;
  limit?: number;
  sort?: string;
  sortDir?: string;
  status?: string;
  q?: string;
}) {
  const session = await requireAnyPermission([...SC_SALES_ACCESS]);
  const tenantId = session.user.tenantId;
  const scopedIds = await scScopeForSession(session);
  const field = input?.sort as SalesListSort | undefined;
  return listSalesLines(
    {
      listLines: (pagination, sort) =>
        scSalesRepository.listLines(tenantId, scopedIds, pagination, sort),
      listStatusSources: (sort) =>
        scSalesRepository.listStatusSources(tenantId, scopedIds, sort),
      listLinesByIds: (ids) => scSalesRepository.listLinesByIds(tenantId, scopedIds, ids),
    },
    {
      tenantId,
      page: input?.page,
      limit: parseTablePageSize(input?.limit),
      sort: {
        field: field && SC_SALES_SORT_FIELDS.has(field) ? field : undefined,
        dir: input?.sortDir === "asc" || input?.sortDir === "desc" ? input.sortDir : undefined,
      },
      status: input?.status,
      q: input?.q,
    },
  );
}

export async function getScSalesKpisAction(q?: string) {
  const session = await requireAnyPermission([...SC_SALES_ACCESS]);
  const scopedIds = await scScopeForSession(session);
  const sources = await scSalesRepository.listStatusSources(session.user.tenantId, scopedIds);
  return computeSalesKpis(session.user.tenantId, sources, q);
}

export async function getScSaleDetailsAction(saleId: string) {
  const session = await requireAnyPermission([...SC_SALES_ACCESS]);
  const scopedIds = await scScopeForSession(session);
  const sale = await scSalesRepository.findSaleDetails(
    session.user.tenantId,
    scopedIds,
    saleId,
  );
  if (!sale) return { error: "Sale not found" as const };
  return toSaleDetailsPayload(session.user.tenantId, sale);
}

/** Active service centers in the user's area of responsibility (Service center sold). */
export async function listScCentersForSalesAction() {
  const session = await requireAnyPermission([SC_SALES_CREATE, SC_SALES_UPDATE]);
  const scopedIds = await scScopeForSession(session);
  return prisma.serviceCenter.findMany({
    where: {
      tenantId: session.user.tenantId,
      deletedAt: null,
      status: "active",
      ...(scopedIds ? { id: { in: scopedIds } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Stock-source locations of one service center, with their STK count. Locations without
 * stock stay listed so a TO-FOLLOW sale can still be encoded.
 */
export async function listScStockSourcesForSalesAction(serviceCenterId: string) {
  const session = await requireAnyPermission([SC_SALES_CREATE, SC_SALES_UPDATE]);
  const tenantId = session.user.tenantId;
  assertScInScope(serviceCenterId, await scScopeForSession(session));

  const [locations, stkCodeId] = await Promise.all([
    prisma.serviceCenterLocation.findMany({
      where: { serviceCenterId, serviceCenter: { tenantId, deletedAt: null } },
      select: { id: true, name: true, code: true },
      orderBy: { code: "asc" },
    }),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "STK"),
  ]);
  if (locations.length === 0) return [];

  const stocked = await prisma.serviceCenterInventory.groupBy({
    by: ["serviceCenterLocationId"],
    where: {
      tenantId,
      serviceCenterLocationId: { in: locations.map((location) => location.id) },
      statusCodeId: stkCodeId,
    },
    _count: { id: true },
  });
  const stkByLocation = new Map(
    stocked.map((row) => [row.serviceCenterLocationId, row._count.id]),
  );

  return locations
    .map((location) => ({
      id: location.id,
      name: `${scLocationLabel(location)} · ${stkByLocation.get(location.id) ?? 0} STK`,
      stk: stkByLocation.get(location.id) ?? 0,
    }))
    .sort((left, right) => Number(right.stk > 0) - Number(left.stk > 0))
    .map(({ id, name }) => ({ id, name }));
}

export async function listScSaleableSerialsAction(input: {
  serviceCenterLocationId: string;
  modelId?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResult<SaleableSerialItem>> {
  const session = await requirePermission(SC_SALES_CREATE);
  const tenantId = session.user.tenantId;
  const scopedIds = await scScopeForSession(session);
  const location = await prisma.serviceCenterLocation.findFirst({
    where: {
      id: input.serviceCenterLocationId.trim(),
      serviceCenter: { tenantId, deletedAt: null },
    },
    select: { id: true, serviceCenterId: true },
  });
  const page = resolveSaleableSerialPage(input);
  if (!location) {
    return toPaginatedResult<SaleableSerialItem>([], 0, page.page, page.limit);
  }
  assertScInScope(location.serviceCenterId, scopedIds);

  const stkCodeId = await reasonStatusService.requireCodeId(
    tenantId,
    "inventory_system",
    "STK",
  );
  return queryScSaleableSerials(prisma, {
    tenantId,
    serviceCenterLocationId: location.id,
    modelId: input.modelId,
    search: input.search,
    page: input.page,
    limit: input.limit,
    stkCodeId,
  });
}

export async function createScSaleAction(input: unknown) {
  const session = await requirePermission(SC_SALES_CREATE);
  const parsed = scSaleSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid sale" };
  const tenantId = session.user.tenantId;
  const { serviceCenterId, serviceCenterLocationId } = parsed.data;

  try {
    await assertScStockSource(tenantId, await scScopeForSession(session), parsed.data);
  } catch (e) {
    return { error: errorMessage(e, "Access denied") };
  }

  const resolvedDate = resolveSaleTransactionDate(parsed.data.transactionDate);
  if ("error" in resolvedDate) return { error: resolvedDate.error };
  const transactionDate = resolvedDate.date;

  const details = await priceSaleDetails(tenantId, parsed.data.details, transactionDate);
  const realSerialIds = realSaleSerialIds(details);
  if (hasDuplicateSaleSerials(realSerialIds)) {
    return { error: DUPLICATE_SALE_SERIAL_ERROR };
  }

  if (
    await isScTransactionNoTaken({
      tenantId,
      serviceCenterId,
      transactionNo: parsed.data.transactionNo,
    })
  ) {
    return { error: TRANSACTION_NO_TAKEN };
  }

  const hasToFollow = details.some((d) => isToFollowSerial(d.serialNumberId));
  const { stkCodeId, targetStatusCodeId, fwCodeId } =
    await resolveSaleEncodeStatusCodes(tenantId, {
      hasRealSerials: realSerialIds.length > 0,
      hasToFollow,
      reserved: Boolean(parsed.data.reserved),
    });

  const realDetails = details.filter((detail) => !isToFollowSerial(detail.serialNumberId));
  if (stkCodeId) {
    try {
      for (const detail of realDetails) {
        await assertScSerialSellable(prisma, {
          tenantId,
          serialNumberId: detail.serialNumberId,
          serviceCenterLocationId,
          stkCodeId,
          expectedModelId: detail.modelId,
        });
      }
    } catch (e) {
      return { error: errorMessage(e, "Serial is not sellable") };
    }
  }

  let row;
  try {
    row = await prisma.$transaction(async (tx) => {
      const { deliveryMethodName } = await assertSaleLookups(
        tx,
        tenantId,
        parsed.data,
        details,
      );

      if (realDetails.length > 0) {
        await lockSerialNumbers(
          tx,
          realDetails.map((detail) => detail.serialNumberId),
        );
        for (const detail of realDetails) {
          // The service center and location were loaded under this tenant above.
          await assertSerialLinkForSaleLine(tx, {
            tenantId,
            saleTenantId: tenantId,
            stockTenantId: tenantId,
            detailModelId: detail.modelId,
            detailBrandId: detail.brandId,
            serialNumberId: detail.serialNumberId,
          });
        }
      }

      const keepsDeliveryReceipt = capturesDeliveryReceipt(deliveryMethodName);
      const created = await tx.serviceCenterSalesTransaction.create({
        data: {
          tenantId,
          serviceCenterId,
          serviceCenterLocationId,
          ...saleHeaderCreateData(parsed.data, {
            transactionDate,
            details,
            createdById: session.user.id,
          }),
        },
      });

      for (const detail of details) {
        if (isToFollowSerial(detail.serialNumberId)) {
          await tx.serviceCenterSalesTransactionDetail.create({
            data: {
              salesId: created.id,
              ...saleDetailRowData(detail, {
                serialNumberId: null,
                statusCodeId: fwCodeId,
                keepsDeliveryReceipt,
              }),
            },
          });
          continue;
        }

        if (!stkCodeId || !targetStatusCodeId) {
          throw new Error("Inventory status codes are not configured");
        }
        await markScSerialSold(tx, {
          tenantId,
          serialNumberId: detail.serialNumberId,
          serviceCenterLocationId,
          stkCodeId,
          targetStatusCodeId,
          expectedModelId: detail.modelId,
        });
        await tx.serviceCenterSalesTransactionDetail.create({
          data: {
            salesId: created.id,
            ...saleDetailRowData(detail, {
              serialNumberId: detail.serialNumberId,
              statusCodeId: targetStatusCodeId,
              keepsDeliveryReceipt,
            }),
          },
        });
      }

      return created;
    });
  } catch (e) {
    return { error: errorMessage(e, "Failed to record sale") };
  }

  await auditService.log({
    tenantId,
    userId: session.user.id,
    action: parsed.data.reserved ? "sc_sale.reserved" : "sc_sale.created",
    entityType: "ServiceCenterSalesTransaction",
    entityId: row.id,
    metadata: {
      transactionNo: row.transactionNo,
      reserved: Boolean(parsed.data.reserved),
      detailCount: details.length,
      toFollowCount: details.filter((d) => isToFollowSerial(d.serialNumberId)).length,
      placeholder: TO_FOLLOW_SERIAL_ID,
      serviceCenterId,
      serviceCenterLocationId,
    },
  });

  revalidateScSales();
  return { success: true as const };
}

export async function updateScSaleHeaderAction(input: unknown) {
  const session = await requirePermission(SC_SALES_UPDATE);
  const parsed = updateScSaleHeaderSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid sale header update" as const };
  const data = parsed.data;
  const tenantId = session.user.tenantId;
  const scopedIds = await scScopeForSession(session);

  const sale = await prisma.serviceCenterSalesTransaction.findFirst({
    where: {
      id: data.saleId,
      tenantId,
      ...(scopedIds ? { serviceCenterId: { in: scopedIds } } : {}),
    },
    select: {
      id: true,
      serviceCenterId: true,
      serviceCenterLocationId: true,
      transactionNo: true,
      transactionDate: true,
      details: {
        select: {
          id: true,
          serialNumberId: true,
          statusCode: { select: { code: true } },
        },
      },
    },
  });
  if (!sale) return { error: "Sale not found" as const };
  if (saleHasOfficialSoldLine(sale.details)) {
    return { error: "Official Sold sales cannot have their header edited" as const };
  }

  try {
    await assertScStockSource(tenantId, scopedIds, data);
  } catch (e) {
    return { error: errorMessage(e, "Access denied") };
  }

  const hasRealSerials = sale.details.some((d) => d.serialNumberId);
  if (
    hasRealSerials &&
    (data.serviceCenterId !== sale.serviceCenterId ||
      data.serviceCenterLocationId !== sale.serviceCenterLocationId)
  ) {
    return {
      error:
        "Service center and location can only change when every line is still TO-FOLLOW",
    };
  }

  const resolvedDate = resolveSaleTransactionDate(
    data.transactionDate,
    toDateInputValue(sale.transactionDate),
  );
  if ("error" in resolvedDate) return { error: resolvedDate.error };
  const transactionDate = resolvedDate.date;

  if (
    (data.transactionNo !== sale.transactionNo ||
      data.serviceCenterId !== sale.serviceCenterId) &&
    (await isScTransactionNoTaken({
      tenantId,
      serviceCenterId: data.serviceCenterId,
      transactionNo: data.transactionNo,
      exceptSaleId: sale.id,
    }))
  ) {
    return { error: TRANSACTION_NO_TAKEN };
  }

  try {
    await assertSaleHeaderLookups(prisma, tenantId, data);
  } catch (e) {
    return { error: errorMessage(e, "Invalid sale header") };
  }

  const currentlyReserved = isSaleReserved(sale.details);
  const reservedToggle = resolveReservedToggle(sale.details, data.reserved);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.serviceCenterSalesTransaction.update({
        where: { id: sale.id },
        data: {
          serviceCenterId: data.serviceCenterId,
          serviceCenterLocationId: data.serviceCenterLocationId,
          ...saleHeaderUpdateData(data, transactionDate),
        },
      });

      if (!reservedToggle) return;
      const [fromCodeId, toCodeId] = await Promise.all([
        reasonStatusService.requireCodeId(tenantId, "inventory_system", reservedToggle.fromCode),
        reasonStatusService.requireCodeId(tenantId, "inventory_system", reservedToggle.toCode),
      ]);
      for (const line of reservedToggle.lines) {
        await tx.serviceCenterSalesTransactionDetail.update({
          where: { id: line.id },
          data: { statusCodeId: toCodeId },
        });
        await moveScSoldSerialStatus(tx, {
          tenantId,
          serialNumberId: line.serialNumberId,
          fromCodeId,
          toCodeId,
        });
      }
    });
  } catch (e) {
    return { error: errorMessage(e, "Failed to update sale header") };
  }

  await auditService.log({
    tenantId,
    userId: session.user.id,
    action: "sc_sale.header_updated",
    entityType: "ServiceCenterSalesTransaction",
    entityId: sale.id,
    metadata: {
      transactionNo: data.transactionNo,
      previousTransactionNo: sale.transactionNo,
      reserved: data.reserved ?? currentlyReserved,
    },
  });

  revalidateScSales();
  return { success: true as const };
}

/**
 * Per-line Edit on a TO-FOLLOW line: assign its serial from the sale's SC location
 * (STK → SLD) and/or record its delivery receipt. Real-serial lines cannot be edited.
 */
export async function updateScSaleSerialAction(input: unknown) {
  const session = await requirePermission(SC_SALES_CREATE);
  const parsed = updateSaleSerialSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid sale line update" };
  const tenantId = session.user.tenantId;
  const scopedIds = await scScopeForSession(session);

  const { saleId, detailId, serialNumberId } = parsed.data;
  const nextSerialId = isToFollowSerial(serialNumberId) ? null : serialNumberId;

  const sale = await prisma.serviceCenterSalesTransaction.findFirst({
    where: {
      id: saleId,
      tenantId,
      ...(scopedIds ? { serviceCenterId: { in: scopedIds } } : {}),
    },
    select: {
      id: true,
      transactionNo: true,
      serviceCenterLocationId: true,
      customerDeliveryMethod: { select: { name: true } },
      details: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          modelId: true,
          brandId: true,
          serialNumberId: true,
          deliveryNo: true,
          deliveryDate: true,
        },
      },
    },
  });
  if (!sale) return { error: "Sale not found" };
  const targetDetail = detailId
    ? sale.details.find((d) => d.id === detailId)
    : sale.details[0];
  if (!targetDetail) return { error: "Sale detail line not found" };
  if (targetDetail.serialNumberId) {
    return { error: "Only TO-FOLLOW sale lines can be edited" };
  }

  const { deliveryNo, deliveryDate, changed: deliveryChanged } = resolveLineDeliveryEdit({
    deliveryMethodName: sale.customerDeliveryMethod?.name,
    submitted: parsed.data,
    current: targetDetail,
  });

  if (!nextSerialId) {
    if (!deliveryChanged) return { success: true as const };
    await prisma.serviceCenterSalesTransactionDetail.update({
      where: { id: targetDetail.id },
      data: { deliveryNo, deliveryDate },
    });
    await auditService.log({
      tenantId,
      userId: session.user.id,
      action: "sc_sale.delivery_updated",
      entityType: "ServiceCenterSalesTransaction",
      entityId: sale.id,
      metadata: {
        transactionNo: sale.transactionNo,
        detailId: targetDetail.id,
        deliveryNo: deliveryNo ?? null,
        deliveryDate: toDateInputValue(deliveryDate),
      },
    });
    revalidateScSales();
    return { success: true as const };
  }

  const serviceCenterLocationId = sale.serviceCenterLocationId;
  const modelId = targetDetail.modelId;
  if (!serviceCenterLocationId) {
    return { error: "This sale has no stock-source location" };
  }
  if (!modelId) return { error: "Choose a model before assigning a serial." };

  const [stkCodeId, sldCodeId] = await Promise.all([
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "STK"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "SLD"),
  ]);

  try {
    await assertScSerialSellable(prisma, {
      tenantId,
      serialNumberId: nextSerialId,
      serviceCenterLocationId,
      stkCodeId,
      expectedModelId: modelId,
    });
  } catch (e) {
    return { error: errorMessage(e, "Serial is not sellable") };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await lockSerialNumbers(tx, [nextSerialId]);
      await assertSerialLinkForSaleLine(tx, {
        tenantId,
        saleTenantId: tenantId,
        stockTenantId: tenantId,
        detailModelId: modelId,
        detailBrandId: targetDetail.brandId,
        serialNumberId: nextSerialId,
      });
      await claimToFollowSaleLine(tx.serviceCenterSalesTransactionDetail, {
        detailId: targetDetail.id,
        saleId: sale.id,
        serialNumberId: nextSerialId,
        statusCodeId: sldCodeId,
        deliveryNo,
        deliveryDate,
      });
      // Inventory consume commits only after this line was claimed.
      await markScSerialSold(tx, {
        tenantId,
        serialNumberId: nextSerialId,
        serviceCenterLocationId,
        stkCodeId,
        targetStatusCodeId: sldCodeId,
        expectedModelId: modelId,
      });
    });
  } catch (e) {
    return { error: errorMessage(e, "Failed to update serial") };
  }

  await auditService.log({
    tenantId,
    userId: session.user.id,
    action: "sc_sale.serial_updated",
    entityType: "ServiceCenterSalesTransaction",
    entityId: sale.id,
    metadata: {
      transactionNo: sale.transactionNo,
      detailId: targetDetail.id,
      toSerialId: nextSerialId,
      serviceCenterLocationId,
      deliveryNo: deliveryNo ?? null,
      deliveryDate: toDateInputValue(deliveryDate),
    },
  });

  revalidateScSales();
  return { success: true as const };
}
