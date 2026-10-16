import { Prisma } from "@prisma/client";

import {
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

type BranchGroupAggRaw = {
  branch_id: string;
  branch_name: string;
  branch_sap_code: string;
  stk: number | bigint;
  def: number | bigint;
  rsv: number | bigint;
  pending_inspection: number | bigint;
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

function groupAggregateSelectSql(
  statusCodes: readonly InventoryGroupStatusCodeRef[],
): Prisma.Sql {
  const pending = openPendingDefectReportExistsSql();
  const statusCountArgs = statusCodes.flatMap((status) => [
    Prisma.sql`CAST(${status.code} AS text)`,
    Prisma.sql`COUNT(*) FILTER (WHERE bi.status_code_id = CAST(${status.id} AS text))::int`,
  ]);
  return Prisma.sql`
    COUNT(*) FILTER (WHERE rsc.code = 'STK' AND NOT (${pending}))::int AS stk,
    COUNT(*) FILTER (WHERE rsc.code = 'DEF')::int AS def,
    COUNT(*) FILTER (WHERE rsc.code = 'RSV')::int AS rsv,
    COUNT(*) FILTER (WHERE rsc.code = 'STK' AND (${pending}))::int AS pending_inspection,
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
