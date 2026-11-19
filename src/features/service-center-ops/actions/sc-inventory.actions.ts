"use server";

import { z } from "zod";

import { inventoryRepository } from "@/features/inventory/repositories/inventory.repository";
import { formatPeriodDate } from "@/features/master-data/types/client-price-list";
import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { SC_INVENTORY_VIEW } from "@/features/service-center-ops/constants/sc-permissions";
import {
  buildScInventoryOverview,
  scInventoryAgingDays,
  scInventoryModelOptions,
  scInventoryStatusAmounts,
  scInventoryStatuses,
  SC_INVENTORY_HIDDEN_STATUS_CODES,
  type ScInventoryAggregateRow,
} from "@/features/service-center-ops/lib/sc-inventory-overview";
import { scInventoryViewRepository } from "@/features/service-center-ops/repositories/sc-inventory-view.repository";
import { resolveScIdsForUser } from "@/features/service-center-ops/services/sc-scope";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requireAnyPermission, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";
import { decimalToNumber } from "@/lib/database/decimal";

/**
 * Service Center Inventory is read-only: units arrive through deliveries (Check SAP, then
 * Accept) and leave through sales and pull-outs. Nothing here changes a unit.
 */

async function scInventorySession() {
  const session = await requirePermission(SC_INVENTORY_VIEW);
  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  return { tenantId: session.user.tenantId, scopedIds };
}

async function priceRowsFor(tenantId: string, rows: readonly ScInventoryAggregateRow[]) {
  const modelIds = [...new Set(rows.map((row) => row.modelId))];
  const prices = await inventoryRepository.listModelPriceListRows(tenantId, modelIds);
  return prices.map((row) => ({
    modelId: row.modelId,
    amount: decimalToNumber(row.amount),
    periodStart: formatPeriodDate(row.periodStart),
    periodEnd: formatPeriodDate(row.periodEnd),
    packageTypeId: row.packageTypeId,
  }));
}

const optionalId = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => value || undefined);

const overviewInput = z.object({
  serviceCenterId: optionalId,
  seriesId: optionalId,
});

/**
 * Cards, per-center rows, status strip and series panel. With a center, everything is for
 * that center only (and only if it is in the user's scope).
 */
export async function getScInventoryOverviewAction(input?: { serviceCenterId?: string; seriesId?: string }) {
  const { tenantId, scopedIds } = await scInventorySession();
  const { serviceCenterId, seriesId } = overviewInput.parse(input ?? {});

  const [rows, centers, statusOptions] = await Promise.all([
    scInventoryViewRepository.aggregate(tenantId, scopedIds, { serviceCenterId, seriesId }),
    // A center filter is honored only inside scope, same as the aggregate.
    serviceCenterId && scopedIds && !scopedIds.includes(serviceCenterId)
      ? Promise.resolve([])
      : prisma.serviceCenter.findMany({
          where: {
            tenantId,
            deletedAt: null,
            status: "active",
            ...(serviceCenterId
              ? { id: serviceCenterId }
              : scopedIds
                ? { id: { in: scopedIds } }
                : {}),
          },
          select: {
            id: true,
            name: true,
            sapCode: true,
            locations: { orderBy: { code: "asc" }, select: { id: true, code: true, name: true } },
          },
          orderBy: { name: "asc" },
        }),
    reasonStatusService.listActiveCodes(tenantId, "inventory_system"),
  ]);
  const priceRows = await priceRowsFor(tenantId, rows);
  const visibleStatusOptions = statusOptions
    .filter((status) => !(SC_INVENTORY_HIDDEN_STATUS_CODES as readonly string[]).includes(status.code))
    .map((status) => ({ id: status.id, code: status.code, name: status.name, color: status.color ?? null }));

  return {
    overview: buildScInventoryOverview(
      rows,
      priceRows,
      centers.map(({ id, name, sapCode }) => ({ id, name, sapCode })),
    ),
    statuses: scInventoryStatuses(visibleStatusOptions, rows),
    statusAmounts: scInventoryStatusAmounts(rows, priceRows),
    statusOptions: visibleStatusOptions,
    modelOptions: scInventoryModelOptions(rows),
    centers,
  };
}

export type ScInventoryOverviewDto = Awaited<ReturnType<typeof getScInventoryOverviewAction>>;

const unitsInput = z.object({
  serviceCenterId: z.string().trim().min(1).max(64),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().optional(),
  statusCodeId: optionalId,
  sku: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
  locationId: optionalId,
  seriesId: optionalId,
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
});

/** One center's units, paged on the server. */
export async function listScInventoryUnitsAction(input: z.input<typeof unitsInput>) {
  const { tenantId, scopedIds } = await scInventorySession();
  const filters = unitsInput.parse(input);
  const result = await scInventoryViewRepository.listUnits(
    tenantId,
    scopedIds,
    filters.serviceCenterId,
    { page: filters.page, limit: parseTablePageSize(filters.limit) },
    {
      statusCodeId: filters.statusCodeId,
      skuCode: filters.sku,
      serviceCenterLocationId: filters.locationId,
      seriesId: filters.seriesId,
      q: filters.q,
    },
  );

  const now = new Date();
  return {
    ...result,
    items: result.items.map((item) => {
      const line = item.serialNumber.serviceCenterDeliveryLines[0];
      const drDate = line?.delivery.sapDocDate ?? null;
      return {
        id: item.id,
        serialNo: item.serialNumber.serialNo,
        model: {
          sku: item.serialNumber.model.skuCode,
          name: item.serialNumber.model.name,
          series: item.serialNumber.model.series?.name ?? null,
        },
        center: item.serviceCenter,
        location: item.serviceCenterLocation,
        status: item.statusCode
          ? { ...item.statusCode, color: item.statusCode.color ?? null }
          : { id: "", code: "—", name: "No status", color: null },
        drNo: line ? (line.delivery.sapDocNo ?? line.delivery.deliveryNo) : null,
        drDate: drDate ? drDate.toISOString() : null,
        accepted: line ? line.acceptedAt !== null : null,
        agingDays: scInventoryAgingDays(drDate, item.createdAt, now),
        updatedAt: item.updatedAt.toISOString(),
      };
    }),
  };
}

export type ScInventoryUnitDto = Awaited<ReturnType<typeof listScInventoryUnitsAction>>["items"][number];

/** Active series from Master data, for the series menu. */
export async function listScInventorySeriesOptionsAction() {
  const { tenantId } = await scInventorySession();
  const rows = await masterDataRepository.listSeries(tenantId);
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export async function listScCentersForOpsAction() {
  const session = await requireAnyPermission([
    SC_INVENTORY_VIEW,
    "service_centers.sales.view",
    "service_centers.sales.create",
    "service_centers.orders.view",
    "service_centers.orders.create",
    "service_centers.orders.approve",
    "service_centers.logistics.view",
    "service_centers.logistics.create",
    "service_centers.logistics.manage",
  ]);
  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  return prisma.serviceCenter.findMany({
    where: {
      tenantId: session.user.tenantId,
      deletedAt: null,
      status: "active",
      ...(scopedIds ? { id: { in: scopedIds } } : {}),
    },
    include: {
      locations: { orderBy: { code: "asc" }, select: { id: true, code: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
}
