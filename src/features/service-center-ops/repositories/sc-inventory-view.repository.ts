import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
  type PaginationInput,
} from "@/lib/shared/pagination";
import { SC_INVENTORY_HIDDEN_STATUS_CODES } from "@/features/service-center-ops/lib/sc-inventory-overview";

/**
 * Read-only queries behind Service Center Inventory. `serviceCenterIds` is the caller's
 * scope (null = every center in the tenant); a center filter only narrows it.
 */

type AggregateRaw = {
  service_center_id: string;
  center_name: string;
  center_sap_code: string;
  model_id: string;
  sku_code: string;
  model_name: string;
  srp: Prisma.Decimal | null;
  series_name: string | null;
  status_code: string;
  qty: bigint | number;
};

export interface ScInventoryUnitFilters {
  statusCodeId?: string;
  skuCode?: string;
  serviceCenterLocationId?: string;
  seriesId?: string;
  /** Serial, SKU or model name. */
  q?: string;
}

function scopeIds(serviceCenterIds: string[] | null, serviceCenterId?: string): string[] | null {
  if (!serviceCenterId) return serviceCenterIds;
  if (serviceCenterIds && !serviceCenterIds.includes(serviceCenterId)) return [];
  return [serviceCenterId];
}

export const scInventoryViewRepository = {
  /** Units per center × model × status, sold statuses left out. */
  async aggregate(
    tenantId: string,
    serviceCenterIds: string[] | null,
    filters: { serviceCenterId?: string; seriesId?: string } = {},
  ) {
    const ids = scopeIds(serviceCenterIds, filters.serviceCenterId);
    if (ids && ids.length === 0) return [];

    const conditions: Prisma.Sql[] = [
      Prisma.sql`sci.tenant_id = ${tenantId}`,
      Prisma.sql`rsc.code NOT IN (${Prisma.join([...SC_INVENTORY_HIDDEN_STATUS_CODES])})`,
    ];
    if (ids) conditions.push(Prisma.sql`sci.service_center_id IN (${Prisma.join(ids)})`);
    if (filters.seriesId) conditions.push(Prisma.sql`pm.series_id = ${filters.seriesId}`);

    const rows = await prisma.$queryRaw<AggregateRaw[]>`
      SELECT
        sc.id AS service_center_id,
        sc.name AS center_name,
        sc.sap_code AS center_sap_code,
        pm.id AS model_id,
        pm.sku_code,
        pm.name AS model_name,
        pm.srp,
        s.name AS series_name,
        rsc.code AS status_code,
        COUNT(*) AS qty
      FROM service_center_inventories sci
      INNER JOIN service_centers sc ON sc.id = sci.service_center_id
      INNER JOIN serial_numbers sn ON sn.id = sci.serial_number_id
      INNER JOIN product_models pm ON pm.id = sn.model_id
      INNER JOIN reason_status_codes rsc ON rsc.id = sci.status_code_id
      LEFT JOIN series s ON s.id = pm.series_id
      WHERE ${Prisma.join(conditions, " AND ")}
      GROUP BY sc.id, sc.name, sc.sap_code, pm.id, pm.sku_code, pm.name, pm.srp, s.name, rsc.code
    `;

    return rows.map((row) => ({
      serviceCenterId: row.service_center_id,
      centerName: row.center_name,
      centerSapCode: row.center_sap_code,
      modelId: row.model_id,
      skuCode: row.sku_code,
      modelName: row.model_name,
      srp: row.srp === null ? null : Number(row.srp),
      seriesName: row.series_name,
      statusCode: row.status_code,
      qty: Number(row.qty),
    }));
  },

  /** One center's units, newest change first, with the DR that brought each one. */
  async listUnits(
    tenantId: string,
    serviceCenterIds: string[] | null,
    serviceCenterId: string,
    pagination: PaginationInput,
    filters: ScInventoryUnitFilters = {},
  ) {
    const { page, limit, skip, take } = resolvePagination(pagination);
    const ids = scopeIds(serviceCenterIds, serviceCenterId);
    if (!ids || ids.length === 0) return toPaginatedResult([], 0, page, limit);

    const q = filters.q?.trim();
    const where: Prisma.ServiceCenterInventoryWhereInput = {
      tenantId,
      serviceCenterId: { in: ids },
      statusCode: { code: { notIn: [...SC_INVENTORY_HIDDEN_STATUS_CODES] } },
      ...(filters.statusCodeId ? { statusCodeId: filters.statusCodeId } : {}),
      ...(filters.serviceCenterLocationId ? { serviceCenterLocationId: filters.serviceCenterLocationId } : {}),
      serialNumber: {
        model: {
          ...(filters.skuCode ? { skuCode: filters.skuCode } : {}),
          ...(filters.seriesId ? { seriesId: filters.seriesId } : {}),
        },
        ...(q
          ? {
              OR: [
                { serialNo: { contains: q, mode: "insensitive" } },
                { model: { skuCode: { contains: q, mode: "insensitive" } } },
                { model: { name: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
    };

    const [total, items] = await Promise.all([
      prisma.serviceCenterInventory.count({ where }),
      prisma.serviceCenterInventory.findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          statusCode: { select: { id: true, code: true, name: true, color: true } },
          serviceCenter: { select: { id: true, name: true, sapCode: true } },
          serviceCenterLocation: { select: { id: true, name: true, code: true } },
          serialNumber: {
            select: {
              id: true,
              serialNo: true,
              model: { select: { skuCode: true, name: true, series: { select: { name: true } } } },
              serviceCenterDeliveryLines: {
                where: { delivery: { serviceCenterId: { in: ids } } },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  acceptedAt: true,
                  delivery: { select: { deliveryNo: true, sapDocNo: true, sapDocDate: true } },
                },
              },
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip,
        take,
      }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },
};
