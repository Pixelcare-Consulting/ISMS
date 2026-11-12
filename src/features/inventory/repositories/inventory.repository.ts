import { Prisma } from "@prisma/client";
import {
  STOCK_UNITS_DEFAULT_SORT,
  STOCK_UNITS_DEFAULT_SORT_DIR,
} from "@/features/inventory/constants/stock-units-sort";
import { prisma } from "@/lib/database/client";
import { formatSapDocNo } from "@/features/logistics/lib/sap-doc-number";
import type { OrderSapDocType } from "@/features/orders/constants/order-sap-doc-type";
import {
  inventoryGroupRepository,
  sentOnPulloutSql,
} from "@/features/inventory/repositories/inventory-group.repository";
import {
  inventoryListInclude,
  type InventoryListRow,
} from "@/features/inventory/repositories/inventory-list.include";
import {
  resolvePagination,
  toPaginatedResult,
  type PaginatedResult,
} from "@/lib/shared/pagination";

export {
  inventoryListInclude,
  type InventoryListRow,
} from "@/features/inventory/repositories/inventory-list.include";

export type InventoryListSort =
  | "updatedAt"
  | "branch"
  | "model"
  | "serial"
  | "dr"
  | "drDate"
  | "planogram"
  | "aging"
  | "status";
export type InventoryListSortDir = "asc" | "desc";

const PRISMA_ORDERABLE_SORTS = new Set<InventoryListSort>([
  "updatedAt",
  "branch",
  "model",
  "serial",
  "status",
]);

function inventoryPrismaOrderBy(
  field: InventoryListSort,
  dir: InventoryListSortDir,
): Prisma.BranchInventoryOrderByWithRelationInput {
  switch (field) {
    case "branch":
      return { branch: { name: dir } };
    case "model":
      return { serialNumber: { model: { skuCode: dir } } };
    case "serial":
      return { serialNumber: { serialNo: dir } };
    case "status":
      return { statusCode: { code: dir } };
    case "updatedAt":
    default:
      return { updatedAt: dir };
  }
}

export type InventoryListFilters = {
  branchId?: string;
  skuCode?: string;
  statusCodeId?: string;
  offPlanogramOnly?: boolean;
  /**
   * When omitted, the list stays on STK, DU, and DEF.
   * Branch Inventory v2 passes the live inventory status codes.
   * An empty array matches nothing.
   */
  statusCodes?: readonly string[];
  /** Serial number or model (SKU or name). */
  q?: string;
};

/**
 * Sellable on-hand stock. Sidebar count, series summary, and orders stay on STK.
 * Display units and defective units are not sellable.
 */
export const SELLABLE_STOCK_STATUS_CODES = ["STK"] as const;

/**
 * All serials keeps a unit on the list after it becomes a display unit or defective.
 * Reserved, sold, in transit, and pull-out statuses stay out of this list.
 */
export const ALL_SERIALS_STATUS_CODES = ["STK", "DU", "DEF"] as const;

export type InventorySeriesSkuAgg = {
  skuCode: string;
  /** Series name on the model. Null when Master data has no series. */
  seriesName: string | null;
  srp: { toString(): string } | number | null;
  qty: number;
};

type SeriesSkuAggRaw = {
  sku_code: string;
  series_name: string | null;
  srp: { toString(): string } | number | null;
  qty: number | bigint;
};

/**
 * Off-planogram = model not on THIS branch's planogram.
 * Prefetch planogram modelIds once, then filter with modelId NOT IN
 * (avoids N correlated `branchPlanograms: { none }` anti-joins).
 */
async function buildOffPlanogramBranchOr(
  tenantId: string,
  effectiveBranchIds: string[],
): Promise<Prisma.BranchInventoryWhereInput[]> {
  const planogramRows = await prisma.branchPlanogram.findMany({
    where: { tenantId, branchId: { in: effectiveBranchIds } },
    select: { branchId: true, modelId: true },
  });

  const modelIdsByBranch = new Map<string, string[]>();
  for (const branchId of effectiveBranchIds) {
    modelIdsByBranch.set(branchId, []);
  }
  for (const row of planogramRows) {
    modelIdsByBranch.get(row.branchId)?.push(row.modelId);
  }

  return effectiveBranchIds.map((branchId) => {
    const planogramModelIds = modelIdsByBranch.get(branchId) ?? [];
    return {
      branchId,
      // Empty planogram ⇒ every unit at the branch is off-planogram.
      ...(planogramModelIds.length > 0
        ? { serialNumber: { modelId: { notIn: planogramModelIds } } }
        : {}),
    };
  });
}

function resolveListStatusCodes(
  filters?: InventoryListFilters,
): readonly string[] {
  if (filters?.statusCodes === undefined) return ALL_SERIALS_STATUS_CODES;
  return [
    ...new Set(
      filters.statusCodes.map((code) => code.trim()).filter((code) => code.length > 0),
    ),
  ];
}

async function buildInventoryWhere(
  tenantId: string,
  branchIds: string[],
  filters?: InventoryListFilters,
): Promise<Prisma.BranchInventoryWhereInput | null> {
  const effectiveBranchIds = filters?.branchId
    ? branchIds.filter((id) => id === filters.branchId)
    : branchIds;

  if (effectiveBranchIds.length === 0) {
    return null;
  }

  const statusCodes = resolveListStatusCodes(filters);
  if (statusCodes.length === 0) return null;

  const and: Prisma.BranchInventoryWhereInput[] = [
    {
      tenantId,
      statusCode: { code: { in: [...statusCodes] } },
      ...(filters?.statusCodeId ? { statusCodeId: filters.statusCodeId } : {}),
    },
  ];

  if (filters?.skuCode) {
    and.push({ serialNumber: { model: { skuCode: filters.skuCode } } });
  }

  const q = filters?.q?.trim();
  if (q) {
    and.push({
      OR: [
        { serialNumber: { serialNo: { contains: q, mode: "insensitive" } } },
        {
          serialNumber: {
            model: {
              OR: [
                { skuCode: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
              ],
            },
          },
        },
      ],
    });
  }

  if (filters?.offPlanogramOnly) {
    and.push({ OR: await buildOffPlanogramBranchOr(tenantId, effectiveBranchIds) });
  } else {
    and.push({ branchId: { in: effectiveBranchIds } });
  }

  return { AND: and };
}

function resolveEffectiveBranchIds(
  branchIds: string[],
  filters?: InventoryListFilters,
): string[] {
  return filters?.branchId
    ? branchIds.filter((id) => id === filters.branchId)
    : branchIds;
}

export type LatestDeliveryReceipt = {
  serialNumberId: string;
  /** Display SAP doc#: "DR: …" / "IT: …" when SAP has one, else the ISMS delivery or slip number. */
  deliveryNo: string;
  /** ISMS delivery number (links to the deliveries list). */
  internalDeliveryNo: string;
  /** DR date: SAP DR date, else acceptedAt, else createdAt. */
  deliveryDate: Date | null;
};

export const inventoryRepository = {
  async listByBranches(
    tenantId: string,
    branchIds: string[],
    pagination?: { page?: number; limit?: number },
    filters?: InventoryListFilters,
    sort?: { field?: InventoryListSort; dir?: InventoryListSortDir },
  ): Promise<PaginatedResult<InventoryListRow>> {
    if (branchIds.length === 0) {
      const { limit, page } = resolvePagination(pagination);
      return toPaginatedResult<InventoryListRow>([], 0, page, limit);
    }

    const { limit, page, skip } = resolvePagination(pagination);
    const where = await buildInventoryWhere(tenantId, branchIds, filters);
    if (!where) {
      return toPaginatedResult<InventoryListRow>([], 0, page, limit);
    }

    const sortField = sort?.field ?? STOCK_UNITS_DEFAULT_SORT;
    const sortDir = sort?.dir ?? STOCK_UNITS_DEFAULT_SORT_DIR;

    if (PRISMA_ORDERABLE_SORTS.has(sortField)) {
      const [items, total] = await Promise.all([
        prisma.branchInventory.findMany({
          where,
          include: inventoryListInclude,
          orderBy: inventoryPrismaOrderBy(sortField, sortDir),
          skip,
          take: limit,
        }),
        prisma.branchInventory.count({ where }),
      ]);
      return toPaginatedResult(items as InventoryListRow[], total, page, limit);
    }

    // Aging / DR# / DR date / planogram need enrichment before sort + page slice.
    const [candidates, total] = await Promise.all([
      prisma.branchInventory.findMany({
        where,
        select: {
          id: true,
          branchId: true,
          serialNumberId: true,
          createdAt: true,
          serialNumber: { select: { modelId: true } },
        },
      }),
      prisma.branchInventory.count({ where }),
    ]);

    if (candidates.length === 0) {
      return toPaginatedResult<InventoryListRow>([], 0, page, limit);
    }

    type Candidate = (typeof candidates)[number];
    type Ranked = {
      id: string;
      agingDays: number;
      deliveryNo: string;
      deliveryDateMs: number | null;
      onPlanogram: boolean;
    };

    const deliveries = await this.findLatestDeliveryReceipts(
      tenantId,
      candidates.map((c) => c.serialNumberId),
    );
    const deliveryBySerial = new Map(
      deliveries.map((d) => [d.serialNumberId, d] as const),
    );

    let onPlanogramKeys = new Set<string>();
    if (sortField === "planogram") {
      const branchIdsForPo = [...new Set(candidates.map((c) => c.branchId))];
      const modelIdsForPo = [
        ...new Set(candidates.map((c) => c.serialNumber.modelId)),
      ];
      const planogramRows = await prisma.branchPlanogram.findMany({
        where: {
          tenantId,
          branchId: { in: branchIdsForPo },
          modelId: { in: modelIdsForPo },
        },
        select: { branchId: true, modelId: true },
      });
      onPlanogramKeys = new Set(
        planogramRows.map((r) => `${r.branchId}:${r.modelId}`),
      );
    }

    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const mul = sortDir === "asc" ? 1 : -1;

    const ranked: Ranked[] = candidates
      .map((c: Candidate): Ranked => {
        const delivery = deliveryBySerial.get(c.serialNumberId);
        const agingAnchor = delivery?.deliveryDate ?? c.createdAt;
        const agingDays = Math.max(
          0,
          Math.floor((nowMs - agingAnchor.getTime()) / dayMs),
        );
        return {
          id: c.id,
          agingDays,
          deliveryNo: delivery?.deliveryNo ?? "",
          deliveryDateMs: delivery?.deliveryDate
            ? delivery.deliveryDate.getTime()
            : null,
          onPlanogram: onPlanogramKeys.has(
            `${c.branchId}:${c.serialNumber.modelId}`,
          ),
        };
      })
      .sort((a, b) => {
        if (sortField === "dr") {
          // Rows without DR# always sort last.
          if (!a.deliveryNo && b.deliveryNo) return 1;
          if (a.deliveryNo && !b.deliveryNo) return -1;
          if (!a.deliveryNo && !b.deliveryNo) {
            return (a.agingDays - b.agingDays) * mul;
          }
          const cmp = a.deliveryNo.localeCompare(b.deliveryNo, undefined, {
            numeric: true,
            sensitivity: "base",
          });
          if (cmp !== 0) return cmp * mul;
          return (a.agingDays - b.agingDays) * mul;
        }
        if (sortField === "drDate") {
          if (a.deliveryDateMs == null && b.deliveryDateMs != null) return 1;
          if (a.deliveryDateMs != null && b.deliveryDateMs == null) return -1;
          if (a.deliveryDateMs == null && b.deliveryDateMs == null) {
            return (a.agingDays - b.agingDays) * mul;
          }
          const cmp = (a.deliveryDateMs! - b.deliveryDateMs!) * mul;
          if (cmp !== 0) return cmp;
          return (a.agingDays - b.agingDays) * mul;
        }
        if (sortField === "planogram") {
          if (a.onPlanogram !== b.onPlanogram) {
            return (Number(a.onPlanogram) - Number(b.onPlanogram)) * mul;
          }
          return (a.agingDays - b.agingDays) * mul;
        }
        return (a.agingDays - b.agingDays) * mul;
      });

    const pageIds = ranked.slice(skip, skip + limit).map((r) => r.id);
    if (pageIds.length === 0) {
      return toPaginatedResult<InventoryListRow>([], total, page, limit);
    }

    const items = await prisma.branchInventory.findMany({
      where: { id: { in: pageIds } },
      include: inventoryListInclude,
    });
    const byId = new Map(
      (items as InventoryListRow[]).map((item) => [item.id, item]),
    );
    const ordered = pageIds
      .map((id) => byId.get(id))
      .filter(
        (item: InventoryListRow | undefined): item is InventoryListRow =>
          Boolean(item),
      );

    return toPaginatedResult(ordered, total, page, limit);
  },

  async findLatestDeliveryReceipts(
    tenantId: string,
    serialNumberIds: string[],
  ): Promise<LatestDeliveryReceipt[]> {
    if (serialNumberIds.length === 0) return [];

    const lines = await prisma.branchDeliveryLine.findMany({
      where: {
        serialNumberId: { in: serialNumberIds },
        delivery: {
          tenantId,
          // pending/partial = units already DIT with a SAP DR; acceptedAt keeps legacy rows.
          OR: [
            { acceptedAt: { not: null } },
            {
              statusCode: { code: { in: ["pending", "partial", "accepted"] } },
            },
          ],
        },
      },
      select: {
        serialNumberId: true,
        delivery: {
          select: {
            deliveryNo: true,
            sapDocNo: true,
            drDate: true,
            acceptedAt: true,
            createdAt: true,
            order: { select: { sapDocType: true } },
          },
        },
      },
    });

    type DeliveryLineRow = {
      serialNumberId: string;
      delivery: {
        deliveryNo: string;
        sapDocNo: string | null;
        drDate: Date | null;
        acceptedAt: Date | null;
        createdAt: Date;
        order: { sapDocType: OrderSapDocType | null } | null;
      };
    };

    const latest = new Map<string, LatestDeliveryReceipt>();
    for (const line of lines as DeliveryLineRow[]) {
      const deliveryDate =
        line.delivery.drDate ??
        line.delivery.acceptedAt ??
        line.delivery.createdAt;
      const existing = latest.get(line.serialNumberId);
      if (
        !existing?.deliveryDate ||
        deliveryDate.getTime() > existing.deliveryDate.getTime()
      ) {
        latest.set(line.serialNumberId, {
          serialNumberId: line.serialNumberId,
          deliveryNo:
            formatSapDocNo(line.delivery.sapDocNo, line.delivery.order?.sapDocType) ??
            line.delivery.deliveryNo,
          internalDeliveryNo: line.delivery.deliveryNo,
          deliveryDate,
        });
      }
    }

    const newestTransfer = await this.findNewestTransferReceipts(tenantId, serialNumberIds);
    for (const [serialNumberId, slip] of newestTransfer) {
      const existing = latest.get(serialNumberId);
      if (existing) {
        latest.set(serialNumberId, { ...existing, deliveryNo: slip.drNo });
        continue;
      }
      latest.set(serialNumberId, {
        serialNumberId,
        deliveryNo: slip.drNo,
        internalDeliveryNo: slip.transferNo,
        deliveryDate: null,
      });
    }
    return Array.from(latest.values());
  },

  /**
   * The DR number from each serial's most recently accepted transfer. A transfer replaces the
   * DR number only: the DR date stays the original delivery's, which ageing counts from.
   */
  async findNewestTransferReceipts(
    tenantId: string,
    serialNumberIds: string[],
  ): Promise<Map<string, { drNo: string; transferNo: string }>> {
    const acceptedLines = await prisma.branchTransferLine.findMany({
      where: {
        serialNumberId: { in: serialNumberIds },
        decision: "accepted",
        transfer: { tenantId, drNo: { not: null } },
      },
      select: {
        serialNumberId: true,
        decidedAt: true,
        transfer: { select: { drNo: true, transferNo: true } },
      },
    });
    const newest = new Map<string, { drNo: string; transferNo: string; decidedAt: number }>();
    for (const row of acceptedLines) {
      const drNo = row.transfer.drNo;
      if (!drNo) continue;
      const decidedAt = row.decidedAt?.getTime() ?? 0;
      const current = newest.get(row.serialNumberId);
      if (!current || decidedAt >= current.decidedAt) {
        newest.set(row.serialNumberId, {
          drNo,
          transferNo: row.transfer.transferNo,
          decidedAt,
        });
      }
    }
    return newest;
  },

  /**
   * Aggregate inventory qty by SKU, including the series stored on the model.
   * Off-planogram uses a set-based NOT EXISTS against branch_planograms.
   */
  async aggregateSeriesBySku(
    tenantId: string,
    branchIds: string[],
    filters?: InventoryListFilters,
  ): Promise<InventorySeriesSkuAgg[]> {
    const effectiveBranchIds = resolveEffectiveBranchIds(branchIds, filters);
    if (effectiveBranchIds.length === 0) return [];

    const conditions: Prisma.Sql[] = [
      Prisma.sql`bi.tenant_id = ${tenantId}`,
      Prisma.sql`bi.branch_id IN (${Prisma.join(effectiveBranchIds)})`,
    ];

    if (filters?.skuCode) {
      conditions.push(Prisma.sql`pm.sku_code = ${filters.skuCode}`);
    }
    conditions.push(
      Prisma.sql`rsc.code IN (${Prisma.join([
        ...SELLABLE_STOCK_STATUS_CODES,
      ])})`,
    );
    if (filters?.offPlanogramOnly) {
      // Set-based anti-join: stock whose model is not on that branch's planogram.
      conditions.push(Prisma.sql`NOT EXISTS (
        SELECT 1
        FROM branch_planograms bp
        WHERE bp.branch_id = bi.branch_id
          AND bp.model_id = sn.model_id
      )`);
    }

    const rows = await prisma.$queryRaw<SeriesSkuAggRaw[]>`
      SELECT
        pm.sku_code,
        s.name AS series_name,
        pm.srp,
        COUNT(*)::int AS qty
      FROM branch_inventories bi
      INNER JOIN serial_numbers sn ON sn.id = bi.serial_number_id
      INNER JOIN product_models pm ON pm.id = sn.model_id
      LEFT JOIN series s ON s.id = pm.series_id
      INNER JOIN reason_status_codes rsc ON rsc.id = bi.status_code_id
      WHERE ${Prisma.join(conditions, " AND ")}
      GROUP BY pm.sku_code, pm.srp, s.name
    `;

    return rows.map((row) => ({
      skuCode: row.sku_code,
      seriesName: row.series_name,
      srp: row.srp,
      qty: Number(row.qty),
    }));
  },

  /** Every unit in scope, less the ones sent on a pull-out (`sentOnPulloutSql`). */
  async countAll(tenantId: string, branchIds: string[]): Promise<number> {
    if (branchIds.length === 0) return 0;
    const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM branch_inventories bi
      WHERE bi.tenant_id = ${tenantId}
        AND bi.branch_id IN (${Prisma.join(branchIds)})
        AND NOT ${sentOnPulloutSql()}
    `;
    return Number(row?.count ?? 0);
  },

  /** Live sellable STK units in scope. Display units and defective units are excluded. */
  countStockUnits(tenantId: string, branchIds: string[]) {
    if (branchIds.length === 0) return Promise.resolve(0);
    return prisma.branchInventory.count({
      where: {
        tenantId,
        branchId: { in: branchIds },
        statusCode: { code: { in: [...SELLABLE_STOCK_STATUS_CODES] } },
      },
    });
  },

  /** Same shape as a Prisma groupBy, less the units sent on a pull-out. */
  async countByStatus(
    tenantId: string,
    branchIds: string[],
  ): Promise<{ statusCodeId: string; _count: { id: number } }[]> {
    if (branchIds.length === 0) return [];
    const rows = await prisma.$queryRaw<{ status_code_id: string; count: bigint }[]>`
      SELECT bi.status_code_id, COUNT(*)::bigint AS count
      FROM branch_inventories bi
      WHERE bi.tenant_id = ${tenantId}
        AND bi.branch_id IN (${Prisma.join(branchIds)})
        AND NOT ${sentOnPulloutSql()}
      GROUP BY bi.status_code_id
    `;
    return rows.map((row) => ({ statusCodeId: row.status_code_id, _count: { id: Number(row.count) } }));
  },

  findByIdWithStatus(tenantId: string, id: string) {
    return prisma.branchInventory.findFirst({
      where: { id, tenantId },
      include: {
        statusCode: { select: { id: true, code: true, name: true } },
      },
    });
  },

  updateStatus(input: {
    tenantId: string;
    id: string;
    statusCodeId: string;
    updatedById: string;
    serialNumberId: string;
    historyDetails: string;
    historyStatus: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const item = await tx.branchInventory.update({
        where: { id: input.id, tenantId: input.tenantId },
        data: {
          statusCodeId: input.statusCodeId,
          updatedById: input.updatedById,
          statusUpdatedAt: new Date(),
        },
      });
      await tx.serialNumberHistory.create({
        data: {
          tenantId: input.tenantId,
          serialNumberId: input.serialNumberId,
          txnType: "inv_status_update",
          details: input.historyDetails,
          status: input.historyStatus,
          createdById: input.updatedById,
        },
      });
      return item;
    });
  },

  countByStatusCode(tenantId: string, branchIds: string[], statusCodeId: string) {
    if (branchIds.length === 0) return Promise.resolve(0);
    return prisma.branchInventory.count({
      where: { tenantId, branchId: { in: branchIds }, statusCodeId },
    });
  },

  /** Price-list periods for the models on the v2 summary cards. */
  listModelPriceListRows(tenantId: string, modelIds: readonly string[]) {
    if (modelIds.length === 0) return Promise.resolve([]);
    return prisma.priceList.findMany({
      where: { tenantId, modelId: { in: [...modelIds] } },
      select: {
        modelId: true,
        amount: true,
        periodStart: true,
        periodEnd: true,
        packageTypeId: true,
      },
    });
  },

  ...inventoryGroupRepository,
};

export type {
  InventoryGroupBranchRow,
  InventoryGroupListFilters,
  InventoryGroupModelRow,
  InventoryGroupStatusCodeRef,
  InventoryGroupWarehouseRow,
} from "@/features/inventory/repositories/inventory-group.repository";
