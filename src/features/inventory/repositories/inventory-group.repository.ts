import { Prisma } from "@prisma/client";

import type { StockUnitsWarehouseRole } from "@/features/inventory/constants/stock-units-group";
import {
  inventoryGroupAggregatesFromParts,
  inventoryGroupAggregatesFromSqlRow,
  type InventoryGroupCountParts,
} from "@/features/inventory/utils/stock-units-group-aggregates";
import { stockUnitsGroupSearchPattern } from "@/features/inventory/utils/stock-units-group-search";
import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
  type PaginatedResult,
} from "@/lib/shared/pagination";

import type { InventoryListFilters } from "./inventory.repository";
import {
  inventoryListInclude,
  type InventoryListRow,
} from "@/features/inventory/repositories/inventory-list.include";

export type InventoryGroupListFilters = InventoryListFilters & {
  q?: string;
  modelId?: string;
};

/** Active inventory status, same rows the summary cards use. */
export type InventoryGroupStatusCodeRef = {
  id: string;
  code: string;
};

export type InventoryGroupBranchRow = {
  branchId: string;
  branchName: string;
  branchSapCode: string;
} & InventoryGroupCountParts;

export type InventoryGroupModelRow = {
  modelId: string;
  skuCode: string;
  modelName: string;
  brandName: string | null;
} & InventoryGroupCountParts;

/**
 * One warehouse under a branch in the By warehouse view. `stockBranchId` is whose
 * branch stock it holds: the branch itself for its primary warehouse, the alternate
 * branch for an alternate. Models and serials below it are that branch's.
 */
export type InventoryGroupWarehouseRow = {
  role: StockUnitsWarehouseRole;
  stockBranchId: string;
  stockBranchName: string;
  stockBranchSapCode: string;
  /** The branch's primary warehouse record; null for an alternate or when none is set. */
  warehouseCode: string | null;
  warehouseName: string | null;
} & InventoryGroupCountParts;

type BranchGroupAggRaw = {
  branch_id: string;
  branch_name: string;
  branch_sap_code: string;
  stk: number | bigint;
  def: number | bigint;
  rsv: number | bigint;
  pending_inspection: number | bigint;
  stk_not_stocked_in: number | bigint;
  status_counts?: unknown;
};

type ModelGroupAggRaw = {
  model_id: string;
  sku_code: string;
  model_name: string;
  brand_name: string | null;
  stk: number | bigint;
  def: number | bigint;
  rsv: number | bigint;
  pending_inspection: number | bigint;
  stk_not_stocked_in: number | bigint;
  status_counts?: unknown;
};

type ModelBranchSubgroupRaw = {
  branch_id: string;
  branch_name: string;
  branch_sap_code: string;
  stk: number | bigint;
  def: number | bigint;
  rsv: number | bigint;
  pending_inspection: number | bigint;
  stk_not_stocked_in: number | bigint;
  status_counts?: unknown;
};

/** Open pending_inspection defect report for a branch inventory row. */
function openPendingDefectReportExistsSql(): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1
    FROM branch_defect_reports bdr
    WHERE bdr.branch_inventory_id = bi.id
      AND bdr.tenant_id = bi.tenant_id
      AND bdr.status = 'pending_inspection'
  )`;
}

function resolveEffectiveBranchIdsForGroups(
  branchIds: string[],
  filters?: InventoryGroupListFilters,
): string[] {
  return filters?.branchId
    ? branchIds.filter((id) => id === filters.branchId)
    : branchIds;
}

/**
 * Whether a branch unit is stocked in, by either route:
 * - ISMS: delivered on a DR that carries both a DR# and a DR date (the same deliveries
 *   the DR# column reads), or placed in a warehouse location by Stock in
 * - SAP: the serial sync linked it to the SAP warehouse that holds it
 *
 * Only stocked-in units count as STK on the grouped views; the rest count toward Total.
 */
function stockedInSql(): Prisma.Sql {
  return Prisma.sql`(
    bi.warehouse_location_id IS NOT NULL
    OR sn.sap_whs_code IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM branch_delivery_lines bdl
      INNER JOIN branch_deliveries bd ON bd.id = bdl.delivery_id
      INNER JOIN reason_status_codes dsc ON dsc.id = bd.status_code_id
      WHERE bdl.serial_number_id = bi.serial_number_id
        AND bd.tenant_id = bi.tenant_id
        AND NULLIF(btrim(bd.dr_no), '') IS NOT NULL
        AND bd.dr_date IS NOT NULL
        AND (bd.accepted_at IS NOT NULL OR dsc.code IN ('pending', 'partial', 'accepted'))
    )
  )`;
}

function groupAggregateSelectSql(
  statusCodes: readonly InventoryGroupStatusCodeRef[],
): Prisma.Sql {
  const pending = openPendingDefectReportExistsSql();
  const stockedIn = stockedInSql();
  const statusCountArgs = statusCodes.flatMap((status) => [
    Prisma.sql`CAST(${status.code} AS text)`,
    status.code === "STK"
      ? Prisma.sql`COUNT(*) FILTER (WHERE bi.status_code_id = CAST(${status.id} AS text) AND ${stockedIn})::int`
      : Prisma.sql`COUNT(*) FILTER (WHERE bi.status_code_id = CAST(${status.id} AS text))::int`,
  ]);
  return Prisma.sql`
    COUNT(*) FILTER (WHERE rsc.code = 'STK' AND ${stockedIn} AND NOT (${pending}))::int AS stk,
    COUNT(*) FILTER (WHERE rsc.code = 'DEF')::int AS def,
    COUNT(*) FILTER (WHERE rsc.code = 'RSV')::int AS rsv,
    COUNT(*) FILTER (WHERE rsc.code = 'STK' AND ${stockedIn} AND (${pending}))::int AS pending_inspection,
    COUNT(*) FILTER (WHERE rsc.code = 'STK' AND NOT ${stockedIn})::int AS stk_not_stocked_in,
    jsonb_build_object(${Prisma.join(statusCountArgs)}) AS status_counts
  `;
}

async function buildGroupInventoryConditions(
  tenantId: string,
  effectiveBranchIds: string[],
  statusCodes: readonly InventoryGroupStatusCodeRef[],
  filters?: InventoryGroupListFilters,
): Promise<Prisma.Sql[] | null> {
  if (effectiveBranchIds.length === 0 || statusCodes.length === 0) return null;

  const conditions: Prisma.Sql[] = [
    Prisma.sql`bi.tenant_id = ${tenantId}`,
    Prisma.sql`bi.branch_id IN (${Prisma.join(effectiveBranchIds)})`,
    Prisma.sql`bi.status_code_id IN (${Prisma.join(statusCodes.map((status) => status.id))})`,
  ];

  if (filters?.modelId) {
    conditions.push(Prisma.sql`sn.model_id = ${filters.modelId}`);
  }
  if (filters?.skuCode) {
    conditions.push(Prisma.sql`pm.sku_code = ${filters.skuCode}`);
  }
  if (filters?.statusCodeId) {
    conditions.push(Prisma.sql`bi.status_code_id = ${filters.statusCodeId}`);
  }

  const searchPattern = stockUnitsGroupSearchPattern(filters?.q);
  if (searchPattern) {
    conditions.push(Prisma.sql`(
      sn.serial_no ILIKE ${searchPattern}
      OR pm.sku_code ILIKE ${searchPattern}
      OR pm.name ILIKE ${searchPattern}
      OR b.name ILIKE ${searchPattern}
    )`);
  }

  if (filters?.offPlanogramOnly) {
    conditions.push(Prisma.sql`NOT EXISTS (
      SELECT 1
      FROM branch_planograms bp
      WHERE bp.branch_id = bi.branch_id
        AND bp.model_id = sn.model_id
    )`);
  }

  return conditions;
}

function mapBranchGroupRow(row: BranchGroupAggRaw): InventoryGroupBranchRow {
  const aggregates = inventoryGroupAggregatesFromSqlRow(row);
  return {
    branchId: row.branch_id,
    branchName: row.branch_name,
    branchSapCode: row.branch_sap_code,
    ...aggregates,
  };
}

function mapModelGroupRow(row: ModelGroupAggRaw): InventoryGroupModelRow {
  const aggregates = inventoryGroupAggregatesFromSqlRow(row);
  return {
    modelId: row.model_id,
    skuCode: row.sku_code,
    modelName: row.model_name,
    brandName: row.brand_name,
    ...aggregates,
  };
}

export const inventoryGroupRepository = {
  async listBranchGroups(
    tenantId: string,
    branchIds: string[],
    pagination?: { page?: number; limit?: number },
    filters?: InventoryGroupListFilters,
    statusCodes: readonly InventoryGroupStatusCodeRef[] = [],
  ): Promise<PaginatedResult<InventoryGroupBranchRow>> {
    const { limit, page, skip } = resolvePagination(pagination);
    const effectiveBranchIds = resolveEffectiveBranchIdsForGroups(branchIds, filters);
    const conditions = await buildGroupInventoryConditions(
      tenantId,
      effectiveBranchIds,
      statusCodes,
      filters,
    );
    if (!conditions) {
      return toPaginatedResult<InventoryGroupBranchRow>([], 0, page, limit);
    }

    const whereClause = Prisma.join(conditions, " AND ");
    const aggSelect = groupAggregateSelectSql(statusCodes);

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<BranchGroupAggRaw[]>`
        SELECT
          b.id AS branch_id,
          b.name AS branch_name,
          b.sap_code AS branch_sap_code,
          ${aggSelect}
        FROM branch_inventories bi
        INNER JOIN branches b ON b.id = bi.branch_id
        INNER JOIN serial_numbers sn ON sn.id = bi.serial_number_id
        INNER JOIN product_models pm ON pm.id = sn.model_id
        INNER JOIN reason_status_codes rsc ON rsc.id = bi.status_code_id
        LEFT JOIN brands br ON br.id = pm.brand_id
        WHERE ${whereClause}
        GROUP BY b.id, b.name, b.sap_code
        ORDER BY b.name ASC
        LIMIT ${limit} OFFSET ${skip}
      `,
      prisma.$queryRaw<Array<{ count: number | bigint }>>`
        SELECT COUNT(*)::int AS count FROM (
          SELECT b.id
          FROM branch_inventories bi
          INNER JOIN branches b ON b.id = bi.branch_id
          INNER JOIN serial_numbers sn ON sn.id = bi.serial_number_id
          INNER JOIN product_models pm ON pm.id = sn.model_id
          INNER JOIN reason_status_codes rsc ON rsc.id = bi.status_code_id
          WHERE ${whereClause}
          GROUP BY b.id
        ) grouped
      `,
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    return toPaginatedResult(rows.map(mapBranchGroupRow), total, page, limit);
  },

  async listModelGroups(
    tenantId: string,
    branchIds: string[],
    pagination?: { page?: number; limit?: number },
    filters?: InventoryGroupListFilters,
    statusCodes: readonly InventoryGroupStatusCodeRef[] = [],
  ): Promise<PaginatedResult<InventoryGroupModelRow>> {
    const { limit, page, skip } = resolvePagination(pagination);
    const effectiveBranchIds = resolveEffectiveBranchIdsForGroups(branchIds, filters);
    const conditions = await buildGroupInventoryConditions(
      tenantId,
      effectiveBranchIds,
      statusCodes,
      filters,
    );
    if (!conditions) {
      return toPaginatedResult<InventoryGroupModelRow>([], 0, page, limit);
    }

    const whereClause = Prisma.join(conditions, " AND ");
    const aggSelect = groupAggregateSelectSql(statusCodes);

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<ModelGroupAggRaw[]>`
        SELECT
          pm.id AS model_id,
          pm.sku_code,
          pm.name AS model_name,
          br.name AS brand_name,
          ${aggSelect}
        FROM branch_inventories bi
        INNER JOIN branches b ON b.id = bi.branch_id
        INNER JOIN serial_numbers sn ON sn.id = bi.serial_number_id
        INNER JOIN product_models pm ON pm.id = sn.model_id
        INNER JOIN reason_status_codes rsc ON rsc.id = bi.status_code_id
        LEFT JOIN brands br ON br.id = pm.brand_id
        WHERE ${whereClause}
        GROUP BY pm.id, pm.sku_code, pm.name, br.name
        ORDER BY pm.sku_code ASC
        LIMIT ${limit} OFFSET ${skip}
      `,
      prisma.$queryRaw<Array<{ count: number | bigint }>>`
        SELECT COUNT(*)::int AS count FROM (
          SELECT pm.id
          FROM branch_inventories bi
          INNER JOIN branches b ON b.id = bi.branch_id
          INNER JOIN serial_numbers sn ON sn.id = bi.serial_number_id
          INNER JOIN product_models pm ON pm.id = sn.model_id
          INNER JOIN reason_status_codes rsc ON rsc.id = bi.status_code_id
          WHERE ${whereClause}
          GROUP BY pm.id
        ) grouped
      `,
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    return toPaginatedResult(rows.map(mapModelGroupRow), total, page, limit);
  },

  async listModelsInBranchGroup(
    tenantId: string,
    branchIds: string[],
    branchId: string,
    pagination?: { page?: number; limit?: number },
    filters?: InventoryGroupListFilters,
    statusCodes: readonly InventoryGroupStatusCodeRef[] = [],
  ): Promise<PaginatedResult<InventoryGroupModelRow>> {
    if (!branchIds.includes(branchId)) {
      const { limit, page } = resolvePagination(pagination);
      return toPaginatedResult<InventoryGroupModelRow>([], 0, page, limit);
    }

    return this.listModelGroups(
      tenantId,
      branchIds,
      pagination,
      {
        ...filters,
        branchId,
      },
      statusCodes,
    );
  },

  /**
   * The branch's primary warehouse (its own units) followed by each alternate warehouse
   * (another branch) that has stock under the current filters. Alternates outside the
   * user's branch scope are left out. A short list, so it is not paginated.
   */
  async listWarehousesInBranchGroup(
    tenantId: string,
    branchIds: string[],
    branchId: string,
    filters?: InventoryGroupListFilters,
    statusCodes: readonly InventoryGroupStatusCodeRef[] = [],
  ): Promise<InventoryGroupWarehouseRow[]> {
    if (!branchIds.includes(branchId)) return [];

    const branch = await prisma.branch.findFirst({
      where: { id: branchId, tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        sapCode: true,
        primaryWarehouse: { select: { code: true, name: true, deletedAt: true } },
        alternateWarehouses: {
          select: {
            alternateBranch: {
              select: { id: true, name: true, sapCode: true, deletedAt: true },
            },
          },
          orderBy: { alternateBranch: { name: "asc" } },
        },
      },
    });
    if (!branch) return [];

    const inScope = new Set(branchIds);
    const alternates = branch.alternateWarehouses
      .map((row) => row.alternateBranch)
      .filter(
        (alternate) =>
          alternate.deletedAt === null && alternate.id !== branch.id && inScope.has(alternate.id),
      );
    const stockBranchIds = [branch.id, ...alternates.map((alternate) => alternate.id)];

    // The URL branch filter picks the top-level branch; it must not hide its alternates.
    const counted = await this.listBranchGroups(
      tenantId,
      stockBranchIds,
      { page: 1, limit: stockBranchIds.length },
      { ...filters, branchId: undefined },
      statusCodes,
    );
    const countsByBranch = new Map(counted.items.map((row) => [row.branchId, row]));
    const countsOf = (id: string): InventoryGroupCountParts => {
      const row = countsByBranch.get(id);
      if (!row) {
        return inventoryGroupAggregatesFromParts({ stk: 0, def: 0, rsv: 0, pendingInspection: 0 });
      }
      return {
        total: row.total,
        available: row.available,
        defective: row.defective,
        reserved: row.reserved,
        pendingInspection: row.pendingInspection,
        notStockedIn: row.notStockedIn,
        statusCounts: row.statusCounts,
      };
    };

    const primaryWarehouse =
      branch.primaryWarehouse && branch.primaryWarehouse.deletedAt === null
        ? branch.primaryWarehouse
        : null;
    const rows: InventoryGroupWarehouseRow[] = [
      {
        role: "PRIMARY",
        stockBranchId: branch.id,
        stockBranchName: branch.name,
        stockBranchSapCode: branch.sapCode,
        warehouseCode: primaryWarehouse?.code ?? null,
        warehouseName: primaryWarehouse?.name ?? null,
        ...countsOf(branch.id),
      },
    ];
    for (const alternate of alternates) {
      if (!countsByBranch.has(alternate.id)) continue;
      rows.push({
        role: "ALTERNATE",
        stockBranchId: alternate.id,
        stockBranchName: alternate.name,
        stockBranchSapCode: alternate.sapCode,
        warehouseCode: null,
        warehouseName: null,
        ...countsOf(alternate.id),
      });
    }
    return rows;
  },

  async listBranchesInModelGroup(
    tenantId: string,
    branchIds: string[],
    modelId: string,
    pagination?: { page?: number; limit?: number },
    filters?: InventoryGroupListFilters,
    statusCodes: readonly InventoryGroupStatusCodeRef[] = [],
  ): Promise<
    PaginatedResult<
      {
        branchId: string;
        branchName: string;
        branchSapCode: string;
      } & InventoryGroupCountParts
    >
  > {
    const { limit, page, skip } = resolvePagination(pagination);
    const effectiveBranchIds = resolveEffectiveBranchIdsForGroups(branchIds, filters);
    const conditions = await buildGroupInventoryConditions(
      tenantId,
      effectiveBranchIds,
      statusCodes,
      {
        ...filters,
        modelId,
      },
    );
    if (!conditions) {
      return toPaginatedResult([], 0, page, limit);
    }

    const whereClause = Prisma.join(conditions, " AND ");
    const aggSelect = groupAggregateSelectSql(statusCodes);

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<ModelBranchSubgroupRaw[]>`
        SELECT
          b.id AS branch_id,
          b.name AS branch_name,
          b.sap_code AS branch_sap_code,
          ${aggSelect}
        FROM branch_inventories bi
        INNER JOIN branches b ON b.id = bi.branch_id
        INNER JOIN serial_numbers sn ON sn.id = bi.serial_number_id
        INNER JOIN product_models pm ON pm.id = sn.model_id
        INNER JOIN reason_status_codes rsc ON rsc.id = bi.status_code_id
        WHERE ${whereClause}
        GROUP BY b.id, b.name, b.sap_code
        ORDER BY b.name ASC
        LIMIT ${limit} OFFSET ${skip}
      `,
      prisma.$queryRaw<Array<{ count: number | bigint }>>`
        SELECT COUNT(*)::int AS count FROM (
          SELECT b.id
          FROM branch_inventories bi
          INNER JOIN branches b ON b.id = bi.branch_id
          INNER JOIN serial_numbers sn ON sn.id = bi.serial_number_id
          INNER JOIN product_models pm ON pm.id = sn.model_id
          INNER JOIN reason_status_codes rsc ON rsc.id = bi.status_code_id
          WHERE ${whereClause}
          GROUP BY b.id
        ) grouped
      `,
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    const items = rows.map((row) => {
      const aggregates = inventoryGroupAggregatesFromSqlRow(row);
      return {
        branchId: row.branch_id,
        branchName: row.branch_name,
        branchSapCode: row.branch_sap_code,
        ...aggregates,
      };
    });
    return toPaginatedResult(items, total, page, limit);
  },

  async listGroupSerials(
    tenantId: string,
    branchIds: string[],
    pagination?: { page?: number; limit?: number },
    filters?: InventoryGroupListFilters & { branchId: string; modelId: string },
    statusCodes: readonly InventoryGroupStatusCodeRef[] = [],
  ): Promise<PaginatedResult<InventoryListRow>> {
    const { limit, page, skip } = resolvePagination(pagination);
    const effectiveBranchIds = resolveEffectiveBranchIdsForGroups(branchIds, filters);
    const statusCodeIds = statusCodes.map((status) => status.id);
    if (
      effectiveBranchIds.length === 0 ||
      statusCodeIds.length === 0 ||
      !filters?.branchId ||
      !filters?.modelId ||
      !effectiveBranchIds.includes(filters.branchId) ||
      (filters.statusCodeId != null && !statusCodeIds.includes(filters.statusCodeId))
    ) {
      return toPaginatedResult<InventoryListRow>([], 0, page, limit);
    }

    const q = filters.q?.trim();
    const andParts: Prisma.BranchInventoryWhereInput[] = [
      {
        tenantId,
        branchId: filters.branchId,
        serialNumber: {
          modelId: filters.modelId,
          ...(filters.skuCode ? { model: { skuCode: filters.skuCode } } : {}),
        },
        statusCodeId: filters.statusCodeId ?? { in: statusCodeIds },
      },
    ];

    if (q) {
      andParts.push({
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
          { branch: { name: { contains: q, mode: "insensitive" } } },
        ],
      });
    }

    if (filters.offPlanogramOnly) {
      const planogramRows = await prisma.branchPlanogram.findMany({
        where: { tenantId, branchId: filters.branchId },
        select: { modelId: true },
      });
      const onPlanogram = planogramRows.map((r) => r.modelId);
      if (onPlanogram.length > 0 && onPlanogram.includes(filters.modelId)) {
        return toPaginatedResult<InventoryListRow>([], 0, page, limit);
      }
    }

    const where: Prisma.BranchInventoryWhereInput = { AND: andParts };

    const [items, total] = await Promise.all([
      prisma.branchInventory.findMany({
        where,
        include: inventoryListInclude,
        orderBy: { serialNumber: { serialNo: "asc" } },
        skip,
        take: limit,
      }),
      prisma.branchInventory.count({ where }),
    ]);

    return toPaginatedResult(items as InventoryListRow[], total, page, limit);
  },
};
