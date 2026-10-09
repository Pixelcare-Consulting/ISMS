import { Prisma, type LookupRecordStatus } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import { MODEL_SERIAL_PAGE_SIZE } from "@/features/serial-numbers/constants/model-serial-page";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { SAP_SYNC_CHUNK } from "@/features/sap/services/sap-master-data";
import {
  createInChunks,
  markSapSeen,
  unseenSince,
  updateEach,
} from "@/features/sap/services/sap-sync-writer";
import type { SapSyncApplyResult } from "@/features/sap/types/sap-sync-entity";
import {
  resolvePagination,
  toPaginatedResult,
} from "@/lib/shared/pagination";

const serialTraceabilityInclude = {
  model: {
    select: {
      id: true,
      skuCode: true,
      name: true,
      description: true,
      status: true,
      srp: true,
      brand: { select: { id: true, name: true } },
      series: { select: { id: true, name: true } },
      feature: { select: { name: true } },
      resolution: { select: { name: true } },
      actualSize: { select: { name: true } },
    },
  },
  branchInventories: {
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      branch: {
        select: {
          id: true,
          name: true,
          sapCode: true,
          region: { select: { name: true } },
          province: { select: { name: true } },
          dealer: { select: { id: true, name: true } },
          primaryWarehouse: {
            select: { id: true, code: true, name: true },
          },
        },
      },
      statusCode: { select: { code: true, name: true, color: true } },
    },
  },
  warehouseInventories: {
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: {
      id: true,
      systemStatus: true,
      updatedAt: true,
      warehouseLocation: {
        select: {
          id: true,
          code: true,
          name: true,
          warehouse: { select: { id: true, code: true, name: true } },
        },
      },
    },
  },
  serviceCenterInventories: {
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: {
      id: true,
      updatedAt: true,
      serviceCenter: { select: { id: true, sapCode: true, name: true } },
      serviceCenterLocation: { select: { code: true, name: true } },
      statusCode: { select: { code: true, name: true, color: true } },
    },
  },
  salesDetails: {
    orderBy: { sale: { createdAt: "desc" } },
    select: {
      id: true,
      saleAmount: true,
      sale: {
        select: {
          id: true,
          transactionNo: true,
          amount: true,
          atrStatus: true,
          createdAt: true,
          transactionDate: true,
          customerName: true,
          branch: { select: { id: true, name: true, sapCode: true } },
          returnRequest: {
            select: {
              id: true,
              status: true,
              createdAt: true,
              actionType: true,
            },
          },
        },
      },
    },
  },
  transferLines: {
    orderBy: { transfer: { createdAt: "desc" } },
    select: {
      id: true,
      transfer: {
        select: {
          id: true,
          transferNo: true,
          createdAt: true,
          fromBranch: { select: { id: true, name: true, sapCode: true } },
          toBranch: { select: { id: true, name: true, sapCode: true } },
          statusCode: { select: { code: true, name: true, color: true } },
        },
      },
    },
  },
  pulloutLines: {
    orderBy: { pullout: { createdAt: "desc" } },
    select: {
      id: true,
      pullout: {
        select: {
          id: true,
          pulloutNo: true,
          createdAt: true,
          branch: { select: { id: true, name: true, sapCode: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          statusCode: { select: { code: true, name: true, color: true } },
        },
      },
    },
  },
  deliveryLines: {
    orderBy: { delivery: { createdAt: "desc" } },
    select: {
      id: true,
      delivery: {
        select: {
          id: true,
          deliveryNo: true,
          createdAt: true,
          acceptedAt: true,
          sapDocRef: true,
          branch: { select: { id: true, name: true, sapCode: true } },
          statusCode: { select: { code: true, name: true, color: true } },
          order: { select: { id: true, orderNumber: true } },
        },
      },
      warehouseLocationFrom: {
        select: {
          code: true,
          name: true,
          warehouse: { select: { code: true, name: true } },
        },
      },
    },
  },
  stockCountLines: {
    orderBy: { countedAt: "desc" },
    select: {
      id: true,
      status: true,
      countedAt: true,
      session: {
        select: {
          id: true,
          sessionNo: true,
          createdAt: true,
          branch: { select: { id: true, name: true, sapCode: true } },
        },
      },
    },
  },
  branchBackloads: {
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      remarks: true,
      createdAt: true,
      branch: { select: { id: true, name: true, sapCode: true } },
      delivery: { select: { id: true, deliveryNo: true } },
    },
  },
  history: {
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      txnType: true,
      details: true,
      status: true,
      createdAt: true,
    },
  },
} satisfies Prisma.SerialNumberInclude;

export type SerialTraceabilityRow = Prisma.SerialNumberGetPayload<{
  include: typeof serialTraceabilityInclude;
}>;

/** The serial list is one row per model, so the only sort is that model's SKU. */
export type SerialNumberListSort = "model";
export type SerialNumberListSortDir = "asc" | "desc";

export interface SerialModelListRow {
  id: string;
  skuCode: string;
  name: string;
  brand: { name: string } | null;
}

/** SAP on-hand count is null until a sync has stamped that model. */
export interface ModelStockFigures {
  sapOnHand: number | null;
  branchQty: number;
}

/** One serial inside a model's expand panel. Branch and inventory status are empty when unset. */
export interface ModelSerialRow {
  id: string;
  serialNo: string;
  recordStatus: LookupRecordStatus;
  /**
   * Branch.sapCode when the on-hand warehouse matches a branch.
   * Otherwise the warehouse code itself, so the row still shows where the unit is.
   */
  branchCode: string | null;
  /** Branch name when one matches. Otherwise the warehouse's own name, when known. */
  branchName: string | null;
  /**
   * On-hand serials of this model at the same branch, or at the same warehouse when
   * no branch matches. Null when the row has no location. This is not the model total.
   */
  branchQty: number | null;
  statusCode: { code: string; name: string; color: string | null } | null;
}

/** Warehouse kept with an on-hand serial so the list can match Branch.sapCode. */
export interface SapOnHandSerial {
  serialNo: string;
  warehouseCode: string;
}

export interface ModelSerialPage {
  items: ModelSerialRow[];
  total: number;
  page: number;
  totalPages: number;
  /** False until an on-hand read has included this model. */
  onHandRecorded: boolean;
}

export interface ModelSyncSummary {
  lastSyncedAt: Date | null;
  /** Live serials in the registry. The row Qty is `ModelStockFigures.sapOnHand`. */
  serialCount: number;
}

/** Stock (STK) at a branch whose planogram already includes this model. */
function branchPlanogramStockWhere(
  tenantId: string,
  stkId: string,
  modelId: string,
): Prisma.BranchInventoryWhereInput {
  return {
    tenantId,
    statusCodeId: stkId,
    serialNumber: { modelId, deletedAt: null },
    branch: { branchPlanograms: { some: { tenantId, modelId } } },
  };
}

/** OSRN.AbsEntry values worth keeping. Zero and blanks are not serial ids. */
function finiteAbsEntry(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

/**
 * Store each serial's SAP id without touching `updated_at`.
 *
 * One statement per chunk, and only where the stored id differs, so a later
 * on-hand read can target these rows without walking the serial master again.
 */
async function writeSapAbsEntries(
  tenantId: string,
  rows: { serialNo: string; docEntry: number }[],
): Promise<void> {
  for (let index = 0; index < rows.length; index += SAP_SYNC_CHUNK) {
    const chunk = rows.slice(index, index + SAP_SYNC_CHUNK);
    const tuples = chunk.map(
      (row) => Prisma.sql`(${row.serialNo}, CAST(${row.docEntry} AS integer))`,
    );
    await prisma.$executeRaw`
      UPDATE "serial_numbers" AS s
      SET "sap_abs_entry" = v.doc_entry
      FROM (VALUES ${Prisma.join(tuples)}) AS v(serial_no, doc_entry)
      WHERE s."tenant_id" = ${tenantId}
        AND s."serial_no" = v.serial_no
        AND s."sap_abs_entry" IS DISTINCT FROM v.doc_entry
    `;
  }
}

async function writeOnHandFlag(
  tenantId: string,
  modelIds: string[],
  serialNos: string[],
  sapOnHand: boolean,
  stampedAt: Date,
  sapWhsCode: string | null,
): Promise<void> {
  for (let index = 0; index < serialNos.length; index += SAP_SYNC_CHUNK) {
    const chunk = serialNos.slice(index, index + SAP_SYNC_CHUNK);
    await prisma.serialNumber.updateMany({
      where: {
        tenantId,
        deletedAt: null,
        modelId: { in: modelIds },
        serialNo: { in: chunk },
      },
      data: { sapOnHand, sapOnHandSyncedAt: stampedAt, sapWhsCode },
    });
  }
}

interface ResolvedBranch {
  id: string;
  sapCode: string;
  name: string;
}

/** Live branches whose SAP code or name matches the serial-list search. */
async function branchSapCodesMatching(tenantId: string, term: string): Promise<string[]> {
  const rows = await prisma.branch.findMany({
    where: {
      tenantId,
      deletedAt: null,
      OR: [
        { sapCode: { contains: term, mode: "insensitive" } },
        { name: { contains: term, mode: "insensitive" } },
      ],
    },
    select: { sapCode: true, primaryWarehouse: { select: { code: true, deletedAt: true } } },
  });
  const codes = new Set<string>();
  for (const row of rows) {
    codes.add(row.sapCode);
    if (row.primaryWarehouse && row.primaryWarehouse.deletedAt === null) {
      codes.add(row.primaryWarehouse.code);
    }
  }
  return [...codes];
}

function rememberBranch(found: Map<string, ResolvedBranch>, code: string, branch: ResolvedBranch) {
  found.set(code, branch);
  const trimmed = code.trim();
  if (trimmed !== code) found.set(trimmed, branch);
}

function rememberLabel(found: Map<string, string>, code: string, label: string | null | undefined) {
  const trimmedLabel = label?.trim() ?? "";
  if (!trimmedLabel) return;
  found.set(code, trimmedLabel);
  const trimmed = code.trim();
  if (trimmed !== code) found.set(trimmed, trimmedLabel);
}

interface WarehouseResolution {
  branches: Map<string, ResolvedBranch>;
  /** Name of a warehouse that did not resolve to exactly one branch. */
  warehouseNames: Map<string, string>;
}

/**
 * Branch for each on-hand warehouse code.
 * A code that equals Branch.sapCode wins. Otherwise a warehouse code maps through
 * Warehouses only when exactly one live branch uses that warehouse. A warehouse
 * linked to none, or to more than one branch, keeps its own name and is not
 * assigned a branch.
 */
async function branchesByWarehouseCode(
  tenantId: string,
  sapCodes: string[],
): Promise<WarehouseResolution> {
  const codes = [...new Set(sapCodes.map((code) => code.trim()).filter((code) => code.length > 0))];
  const found = new Map<string, ResolvedBranch>();
  const warehouseNames = new Map<string, string>();
  if (codes.length === 0) return { branches: found, warehouseNames };

  const branches = await prisma.branch.findMany({
    where: { tenantId, deletedAt: null, sapCode: { in: codes } },
    select: { id: true, sapCode: true, name: true },
  });
  for (const row of branches) rememberBranch(found, row.sapCode, row);

  const remaining = codes.filter((code) => !found.has(code));
  if (remaining.length === 0) return { branches: found, warehouseNames };

  const warehouses = await prisma.warehouse.findMany({
    where: { tenantId, deletedAt: null, code: { in: remaining } },
    select: {
      code: true,
      name: true,
      primaryBranches: {
        where: { deletedAt: null },
        select: { id: true, sapCode: true, name: true },
      },
    },
  });
  for (const warehouse of warehouses) {
    if (warehouse.primaryBranches.length === 1) {
      const branch = warehouse.primaryBranches[0];
      if (branch) rememberBranch(found, warehouse.code, branch);
      continue;
    }
    rememberLabel(warehouseNames, warehouse.code, warehouse.name);
  }
  return { branches: found, warehouseNames };
}

/**
 * On-hand serials of one model, counted by the branch they resolve to.
 * Codes that do not resolve still have a count of their own.
 */
async function onHandQtyByBranch(
  tenantId: string,
  modelId: string,
): Promise<{
  branches: Map<string, ResolvedBranch>;
  warehouseNames: Map<string, string>;
  qtyByBranchId: Map<string, number>;
  qtyByCode: Map<string, number>;
}> {
  const groups = await prisma.serialNumber.groupBy({
    by: ["sapWhsCode"],
    where: {
      tenantId,
      modelId,
      deletedAt: null,
      model: { deletedAt: null },
      sapOnHand: true,
      sapWhsCode: { not: null },
    },
    _count: { id: true },
  });
  const codes = groups.flatMap((group) => (group.sapWhsCode ? [group.sapWhsCode] : []));
  const { branches, warehouseNames } = await branchesByWarehouseCode(tenantId, codes);
  const qtyByBranchId = new Map<string, number>();
  const qtyByCode = new Map<string, number>();
  for (const group of groups) {
    if (!group.sapWhsCode) continue;
    qtyByCode.set(group.sapWhsCode, group._count.id);
    const trimmed = group.sapWhsCode.trim();
    if (trimmed !== group.sapWhsCode) qtyByCode.set(trimmed, group._count.id);
    const branch = branches.get(group.sapWhsCode) ?? branches.get(trimmed);
    if (!branch) continue;
    qtyByBranchId.set(branch.id, (qtyByBranchId.get(branch.id) ?? 0) + group._count.id);
  }
  return { branches, warehouseNames, qtyByBranchId, qtyByCode };
}

/**
 * Location to show on one on-hand row.
 * A stored warehouse code that matches a branch wins over a stock placement.
 * A code that matches no branch still shows that code, plus the warehouse name
 * when this app already has it. It does not pick a branch. With no warehouse
 * yet, a real placement still shows.
 */
function listedBranch(
  sapWhsCode: string | null,
  warehouseBranch: ResolvedBranch | undefined,
  warehouseName: string | null,
  placed: ResolvedBranch | null,
): { branchId: string | null; branchCode: string | null; branchName: string | null } {
  if (sapWhsCode) {
    if (warehouseBranch) {
      return {
        branchId: warehouseBranch.id,
        branchCode: warehouseBranch.sapCode,
        branchName: warehouseBranch.name,
      };
    }
    const code = sapWhsCode.trim();
    return {
      branchId: null,
      branchCode: code.length > 0 ? code : null,
      branchName: warehouseName,
    };
  }
  if (!placed) return { branchId: null, branchCode: null, branchName: null };
  return { branchId: placed.id, branchCode: placed.sapCode, branchName: placed.name };
}

function serialNumberPrismaOrderBy(
  field: SerialNumberListSort,
  dir: SerialNumberListSortDir,
): Prisma.ProductModelOrderByWithRelationInput {
  switch (field) {
    case "model":
      return { skuCode: dir };
    default: {
      const unreachable: never = field;
      return unreachable;
    }
  }
}

/** Live serials of a live model, optionally narrowed by record status. */
function liveModelSerialWhere(
  tenantId: string,
  status?: LookupRecordStatus,
): Prisma.SerialNumberWhereInput {
  return {
    tenantId,
    deletedAt: null,
    ...(status ? { recordStatus: status } : {}),
  };
}

/**
 * One row per model still on Master data that has at least one visible serial.
 * Search matches the SKU, the model name, or a serial number, and still returns
 * the model once.
 */
function listedModelWhere(
  tenantId: string,
  filters?: { q?: string; status?: LookupRecordStatus },
): Prisma.ProductModelWhereInput {
  const q = filters?.q?.trim();
  const liveSerial = liveModelSerialWhere(tenantId, filters?.status);
  const search = q
    ? [
        {
          OR: [
            { skuCode: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            {
              serialNumbers: {
                some: {
                  ...liveSerial,
                  serialNo: { contains: q, mode: "insensitive" as const },
                },
              },
            },
          ],
        },
      ]
    : [];

  return {
    tenantId,
    deletedAt: null,
    AND: [{ serialNumbers: { some: liveSerial } }, ...search],
  };
}

/** Delivery / transfer / pull-out codes that mean the document is still open. */
const OPEN_DELIVERY_CODES = ["requested", "approved", "pending", "partial"] as const;
const OPEN_TRANSFER_CODES = [
  "requested",
  "approved",
  "draft",
  "pending_tl",
  "for_transfer",
  "in_transit",
] as const;
const OPEN_PULLOUT_CODES = [
  "requested",
  "approved",
  "draft",
  "pending_tl",
  "for_pullout",
  "scheduled",
  "pending_logistics",
  "in_transit",
] as const;
const OPEN_ATR_STATUSES = ["open", "reserve"] as const;
const OPEN_RETURN_STATUSES = ["pending_cs", "pending_tl", "approved"] as const;
/** Branch stock that is mid-move, not resting stock or a finished sale. */
const IN_FLIGHT_INVENTORY_CODES = ["DIT", "RSV", "FPO", "FW"] as const;

/**
 * In-progress validation work that must keep the serial: an open stock count
 * (including P-count and Monthly SIR, which run on that session), an open
 * delivery, transfer, or pull-out, an open or reserved sale, an open return,
 * or branch stock that is still moving.
 */
function inFlightSerialWorkflow(): Prisma.SerialNumberWhereInput {
  return {
    OR: [
      { stockCountLines: { some: { session: { status: { not: "closed" } } } } },
      {
        deliveryLines: {
          some: { delivery: { statusCode: { code: { in: [...OPEN_DELIVERY_CODES] } } } },
        },
      },
      {
        transferLines: {
          some: { transfer: { statusCode: { code: { in: [...OPEN_TRANSFER_CODES] } } } },
        },
      },
      {
        pulloutLines: {
          some: { pullout: { statusCode: { code: { in: [...OPEN_PULLOUT_CODES] } } } },
        },
      },
      {
        salesDetails: {
          some: {
            OR: [
              { sale: { atrStatus: { in: [...OPEN_ATR_STATUSES] } } },
              {
                sale: {
                  returnRequest: { status: { in: [...OPEN_RETURN_STATUSES] } },
                },
              },
              { returnRequests: { some: { status: { in: [...OPEN_RETURN_STATUSES] } } } },
            ],
          },
        },
      },
      {
        salesReplacementsOriginal: {
          some: { sale: { atrStatus: { in: [...OPEN_ATR_STATUSES] } } },
        },
      },
      {
        salesReplacementsReplacement: {
          some: { sale: { atrStatus: { in: [...OPEN_ATR_STATUSES] } } },
        },
      },
      {
        serviceCenterSales: {
          some: {
            OR: [
              { atrStatus: { in: [...OPEN_ATR_STATUSES] } },
              { returnRequest: { status: { in: [...OPEN_RETURN_STATUSES] } } },
            ],
          },
        },
      },
      {
        serviceCenterPulloutDetails: {
          some: { pullout: { statusCode: { code: { in: [...OPEN_PULLOUT_CODES] } } } },
        },
      },
      {
        branchInventories: {
          some: { statusCode: { code: { in: [...IN_FLIGHT_INVENTORY_CODES] } } },
        },
      },
    ],
  };
}

/**
 * Unseen serials whose model was removed from Master data. Serials of a model
 * still in Master data are not in this set, so a finished pass leaves them alone.
 */
function removedModelUnseenWhere(
  tenantId: string,
  passMark: Date,
): Prisma.SerialNumberWhereInput {
  return {
    tenantId,
    ...unseenSince(passMark),
    model: { deletedAt: { not: null } },
  };
}

/** Nothing points at the row, so a real delete will not cascade through history or stock. */
function unreferencedSerial(): Prisma.SerialNumberWhereInput {
  return {
    branchInventories: { none: {} },
    transferLines: { none: {} },
    pulloutLines: { none: {} },
    stockCountLines: { none: {} },
    salesDetails: { none: {} },
    salesReplacementsOriginal: { none: {} },
    salesReplacementsReplacement: { none: {} },
    branchBackloads: { none: {} },
    warehouseInventories: { none: {} },
    deliveryLines: { none: {} },
    history: { none: {} },
    serviceCenterInventories: { none: {} },
    serviceCenterSales: { none: {} },
    serviceCenterPulloutDetails: { none: {} },
    serviceBackloads: { none: {} },
  };
}

export const serialNumberRepository = {
  /**
   * One row per model still in Master data. Pagination totals are model counts.
   * Serials of a removed model never appear, even when a sync has not deleted them yet.
   */
  async list(
    tenantId: string,
    pagination?: { page?: number; limit?: number },
    filters?: { q?: string; status?: LookupRecordStatus },
    sort?: { field?: SerialNumberListSort; dir?: SerialNumberListSortDir },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where = listedModelWhere(tenantId, filters);
    const orderBy = sort?.field
      ? serialNumberPrismaOrderBy(sort.field, sort.dir ?? "asc")
      : { skuCode: "asc" as const };

    const [items, total] = await Promise.all([
      prisma.productModel.findMany({
        where,
        select: {
          id: true,
          skuCode: true,
          name: true,
          brand: { select: { name: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.productModel.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },

  findById(tenantId: string, id: string) {
    return prisma.serialNumber.findFirst({ where: { id, tenantId } });
  },

  getTraceability(tenantId: string, id: string) {
    return prisma.serialNumber.findFirst({
      where: { id, tenantId },
      include: serialTraceabilityInclude,
    });
  },

  /**
   * Sibling serials (same SKU) and nearby series models for the detail page.
   * Prefers units at the same branch; falls back to other on-hand same-SKU units.
   * Returns a short `samples` preview plus a fuller `units` list for the related modal.
   */
  async findRelatedUnitsPreview(
    tenantId: string,
    opts: {
      excludeSerialId: string;
      modelId: string;
      seriesId: string | null;
      branchId: string | null;
    },
  ) {
    const previewTake = 5;
    /** Cap for the related-products modal (same-SKU siblings at branch / elsewhere). */
    const listTake = 200;
    const seriesTake = 4;

    const serialSampleSelect = {
      id: true,
      serialNo: true,
      branchInventories: {
        orderBy: { updatedAt: "desc" as const },
        take: 1,
        select: {
          statusCode: { select: { code: true, name: true, color: true } },
          branch: { select: { name: true, sapCode: true } },
        },
      },
    };

    type SeriesModelRow = {
      id: string;
      skuCode: string;
      name: string;
      _count: { serialNumbers: number };
    };

    const seriesPromise: Promise<SeriesModelRow[]> =
      opts.seriesId && opts.branchId
        ? prisma.productModel.findMany({
            where: {
              tenantId,
              seriesId: opts.seriesId,
              id: { not: opts.modelId },
              deletedAt: null,
              serialNumbers: {
                some: {
                  deletedAt: null,
                  branchInventories: { some: { branchId: opts.branchId } },
                },
              },
            },
            orderBy: { skuCode: "asc" },
            take: seriesTake,
            select: {
              id: true,
              skuCode: true,
              name: true,
              _count: {
                select: {
                  serialNumbers: {
                    where: {
                      deletedAt: null,
                      branchInventories: {
                        some: { branchId: opts.branchId },
                      },
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve([]);

    const mapSeriesModels = (models: SeriesModelRow[]) =>
      models.map((model) => ({
        id: model.id,
        skuCode: model.skuCode,
        name: model.name,
        qtyAtBranch: model._count.serialNumbers,
      }));

    type SameSkuUnit = {
      id: string;
      serialNo: string;
      statusCode: { code: string; name: string; color: string | null } | null;
      branchName: string | null;
      branchSapCode: string | null;
    };

    const toSameSkuResult = (
      total: number,
      scope: "branch" | "elsewhere",
      units: SameSkuUnit[],
      seriesModels: SeriesModelRow[],
    ) => ({
      sameSku: {
        total,
        scope,
        samples: units.slice(0, previewTake),
        units,
      },
      seriesModels: mapSeriesModels(seriesModels),
    });

    if (opts.branchId) {
      const branchWhere: Prisma.BranchInventoryWhereInput = {
        tenantId,
        branchId: opts.branchId,
        serialNumberId: { not: opts.excludeSerialId },
        serialNumber: { modelId: opts.modelId, deletedAt: null },
      };

      const [branchTotal, branchRows, seriesModels] = await Promise.all([
        prisma.branchInventory.count({ where: branchWhere }),
        prisma.branchInventory.findMany({
          where: branchWhere,
          orderBy: { updatedAt: "desc" },
          take: listTake,
          select: {
            serialNumber: { select: { id: true, serialNo: true } },
            statusCode: { select: { code: true, name: true, color: true } },
          },
        }),
        seriesPromise,
      ]);

      if (branchTotal > 0) {
        const units: SameSkuUnit[] = branchRows.map((row) => ({
          id: row.serialNumber.id,
          serialNo: row.serialNumber.serialNo,
          statusCode: row.statusCode,
          branchName: null,
          branchSapCode: null,
        }));
        return toSameSkuResult(branchTotal, "branch", units, seriesModels);
      }
    }

    const elsewhereWhere: Prisma.SerialNumberWhereInput = {
      tenantId,
      modelId: opts.modelId,
      deletedAt: null,
      id: { not: opts.excludeSerialId },
      OR: [{ sapOnHand: true }, { branchInventories: { some: {} } }],
    };

    const [elsewhereTotal, elsewhereRows, seriesModels] = await Promise.all([
      prisma.serialNumber.count({ where: elsewhereWhere }),
      prisma.serialNumber.findMany({
        where: elsewhereWhere,
        orderBy: { serialNo: "asc" },
        take: listTake,
        select: serialSampleSelect,
      }),
      seriesPromise,
    ]);

    const units: SameSkuUnit[] = elsewhereRows.map((row) => {
      const inv = row.branchInventories[0] ?? null;
      return {
        id: row.id,
        serialNo: row.serialNo,
        statusCode: inv?.statusCode ?? null,
        branchName: inv?.branch?.name ?? null,
        branchSapCode: inv?.branch?.sapCode ?? null,
      };
    });

    return toSameSkuResult(elsewhereTotal, "elsewhere", units, seriesModels);
  },

  findModelInTenant(tenantId: string, modelId: string) {
    return prisma.productModel.findFirst({
      where: { id: modelId, tenantId },
      select: { id: true },
    });
  },

  listModelOptions(tenantId: string) {
    return prisma.productModel.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { skuCode: "asc" },
      select: { id: true, skuCode: true, name: true },
    });
  },

  /**
   * Item codes still on Master data. Soft-deleted models are left out on purpose:
   * a completed pass does not walk them, so `retireUnseenSapSerials` removes their
   * serials unless an in-progress count, delivery, or sale still needs the row.
   *
   * Active and on-hold models stay in the walk. A retired SKU is soft-deleted by
   * the model sync and drops out. The item-code segment and the parse skip still
   * refuse a SAP serial whose item is not one of these models.
   */
  listSapSyncModelKeys(tenantId: string) {
    return prisma.productModel.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, skuCode: true },
    });
  },

  create(
    tenantId: string,
    data: { serialNo: string; modelId: string; createdById?: string },
  ) {
    return prisma.serialNumber.create({ data: { tenantId, ...data } });
  },

  update(
    tenantId: string,
    id: string,
    data: { serialNo: string; modelId: string },
  ) {
    return prisma.serialNumber.update({ where: { id, tenantId }, data });
  },

  setStatus(tenantId: string, id: string, recordStatus: LookupRecordStatus) {
    return prisma.serialNumber.update({
      where: { id, tenantId },
      data: { recordStatus },
    });
  },

  /**
   * Apply one page of a SAP serial sync.
   *
   * The existence check is an indexed lookup over just this page's serial numbers, so
   * memory stays flat however large the entity is — the reason nothing here ever loads a
   * snapshot of the table.
   *
   * Creates carry no inventory: no BranchInventory or WarehouseInventory row is made, so
   * a synced serial exists in the registry with no location until something in ISMS puts
   * it somewhere.
   *
   * A serial soft-deleted by an earlier pass (gone from SAP) that SAP returns again is
   * restored: undeleted, set active, and relinked to the model SAP now gives it.
   */
  async applySapSyncPage(
    tenantId: string,
    records: { serialNo: string; modelId: string; docEntry?: number }[],
  ): Promise<SapSyncApplyResult> {
    // SAP keys serials per item, so one serial number can arrive under two items within a
    // page. ISMS is unique on serialNo alone, so the first occurrence wins.
    const rows = [...new Map(records.map((row) => [row.serialNo, row])).values()];

    const existing = await prisma.serialNumber.findMany({
      where: { tenantId, serialNo: { in: rows.map((row) => row.serialNo) } },
      select: { id: true, serialNo: true, modelId: true, deletedAt: true },
    });
    const bySerialNo = new Map(existing.map((serial) => [serial.serialNo, serial]));

    const toCreate: { serialNo: string; modelId: string }[] = [];
    const toUpdate: { id: string; serialNo: string; modelId: string; restore: boolean }[] =
      [];
    let unchanged = 0;

    for (const row of rows) {
      const match = bySerialNo.get(row.serialNo);
      if (!match) {
        toCreate.push({ serialNo: row.serialNo, modelId: row.modelId });
        continue;
      }
      // A serial already here from the PSG import gets its model linked (or corrected)
      // rather than being ignored — that link is the point of the sync.
      const restore = match.deletedAt !== null;
      if (match.modelId === row.modelId && !restore) unchanged += 1;
      else toUpdate.push({ id: match.id, serialNo: row.serialNo, modelId: row.modelId, restore });
    }

    const inserted = await createInChunks(toCreate, {
      createMany: async (chunk) => {
        const result = await prisma.serialNumber.createMany({
          data: chunk.map((row) => ({ tenantId, ...row, recordStatus: "active" as const })),
          // A concurrent writer (PSG import, an overlapping slice) may have inserted the
          // same serial between the lookup above and this write.
          skipDuplicates: true,
        });
        return result.count;
      },
      createOne: async (row) => {
        await prisma.serialNumber.create({
          data: { tenantId, ...row, recordStatus: "active" },
        });
      },
      describe: (row) => row.serialNo,
    });

    const changed = await updateEach(toUpdate, {
      updateOne: async (row) => {
        await prisma.serialNumber.update({
          where: { id: row.id, tenantId },
          data: row.restore
            ? { modelId: row.modelId, deletedAt: null, recordStatus: "active" }
            : { modelId: row.modelId },
        });
      },
      describe: (row) => row.serialNo,
    });

    const absRows: { serialNo: string; docEntry: number }[] = [];
    for (const row of rows) {
      const docEntry = finiteAbsEntry(row.docEntry);
      if (docEntry !== null) absRows.push({ serialNo: row.serialNo, docEntry });
    }
    await writeSapAbsEntries(tenantId, absRows);

    return {
      created: inserted.created,
      updated: changed.updated,
      unchanged,
      failures: [...inserted.failures, ...changed.failures],
    };
  },

  markSapSyncSeen(tenantId: string, serialNos: string[], passMark: Date) {
    return markSapSeen("serial_numbers", tenantId, serialNos, passMark);
  },

  /**
   * After a completed pass, drop serials whose model is no longer in Master data.
   * Serials of a model still in Master data stay, even with no branch.
   * An in-progress count, delivery, transfer, pull-out, sale, or return keeps the row.
   * Anything else with no references is deleted. A history or stock link is soft-deleted
   * so those records are not cascaded away.
   */
  async retireUnseenSapSerials(tenantId: string, passMark: Date): Promise<number> {
    const eligible = {
      ...removedModelUnseenWhere(tenantId, passMark),
      NOT: inFlightSerialWorkflow(),
    };
    const deleted = await prisma.serialNumber.deleteMany({
      where: { ...eligible, ...unreferencedSerial() },
    });
    const retired = await prisma.serialNumber.updateMany({
      where: eligible,
      data: { deletedAt: new Date(), recordStatus: "inactive" },
    });
    return deleted.count + retired.count;
  },

  /**
   * Models the Serial numbers table lists: still in Master data, with at least
   * one visible serial. A status narrows that the same way the table filter does.
   */
  countListedModels(tenantId: string, status?: LookupRecordStatus) {
    return prisma.productModel.count({
      where: listedModelWhere(tenantId, status ? { status } : undefined),
    });
  },

  /**
   * Latest SAP stamp on this model's serials. Uses the later of sapSyncedAt and
   * sapOnHandSyncedAt already stored on the serial. Null when neither was set.
   */
  async latestSapSyncByModel(
    tenantId: string,
    modelIds: string[],
  ): Promise<Record<string, ModelSyncSummary>> {
    const summaries: Record<string, ModelSyncSummary> = {};
    for (const modelId of modelIds) {
      summaries[modelId] = { lastSyncedAt: null, serialCount: 0 };
    }
    if (modelIds.length === 0) return summaries;

    const groups = await prisma.serialNumber.groupBy({
      by: ["modelId"],
      where: {
        tenantId,
        deletedAt: null,
        modelId: { in: modelIds },
        model: { deletedAt: null },
      },
      _max: { sapSyncedAt: true, sapOnHandSyncedAt: true },
      _count: { id: true },
    });

    for (const group of groups) {
      summaries[group.modelId] = {
        lastSyncedAt: laterTimestamp(group._max.sapSyncedAt, group._max.sapOnHandSyncedAt),
        serialCount: group._count.id,
      };
    }
    return summaries;
  },

  /**
   * Mark the page's allow-listed serials on hand or not. Serials whose model is not
   * in `modelIds` are left alone, including models removed from Master data.
   */
  async setSapOnHandFlags(
    tenantId: string,
    modelIds: string[],
    onHand: SapOnHandSerial[],
    notOnHandSerialNos: string[],
  ): Promise<void> {
    if (modelIds.length === 0) return;
    const stampedAt = new Date();
    const byWarehouse = new Map<string, string[]>();
    for (const row of onHand) {
      const warehouseCode = row.warehouseCode.trim();
      if (!row.serialNo || !warehouseCode) continue;
      const bucket = byWarehouse.get(warehouseCode);
      if (bucket) bucket.push(row.serialNo);
      else byWarehouse.set(warehouseCode, [row.serialNo]);
    }
    for (const [warehouseCode, serialNos] of byWarehouse) {
      await writeOnHandFlag(tenantId, modelIds, serialNos, true, stampedAt, warehouseCode);
    }
    await writeOnHandFlag(tenantId, modelIds, notOnHandSerialNos, false, stampedAt, null);
  },

  /**
   * For the models on the current page: how many serials the last on-hand read
   * found in SAP, and how many are already Stock at a branch that carries the model.
   */
  async modelStockFigures(
    tenantId: string,
    modelIds: string[],
  ): Promise<Record<string, ModelStockFigures>> {
    const figures: Record<string, ModelStockFigures> = {};
    for (const modelId of modelIds) {
      figures[modelId] = { sapOnHand: null, branchQty: 0 };
    }
    if (modelIds.length === 0) return figures;

    const [onHandGroups, stampedGroups, branchQty] = await Promise.all([
      prisma.serialNumber.groupBy({
        by: ["modelId"],
        where: {
          tenantId,
          deletedAt: null,
          modelId: { in: modelIds },
          sapOnHand: true,
        },
        _count: { id: true },
      }),
      prisma.serialNumber.groupBy({
        by: ["modelId"],
        where: {
          tenantId,
          deletedAt: null,
          modelId: { in: modelIds },
          sapOnHandSyncedAt: { not: null },
        },
        _count: { id: true },
      }),
      serialNumberRepository.countBranchStockOnPlanogram(tenantId, modelIds),
    ]);

    const stamped = new Set(stampedGroups.map((group) => group.modelId));
    const onHand = new Map(onHandGroups.map((group) => [group.modelId, group._count.id]));
    for (const modelId of modelIds) {
      figures[modelId] = {
        sapOnHand: stamped.has(modelId) ? (onHand.get(modelId) ?? 0) : null,
        branchQty: branchQty.get(modelId) ?? 0,
      };
    }
    return figures;
  },

  /** Stock rows at branches whose planogram includes that model. One row counts as one. */
  async countBranchStockOnPlanogram(
    tenantId: string,
    modelIds: string[],
  ): Promise<Map<string, number>> {
    const counts = new Map(modelIds.map((modelId) => [modelId, 0]));
    if (modelIds.length === 0) return counts;

    const stk = await reasonStatusRepository.findCodeId(tenantId, "inventory_system", "STK");
    if (!stk) return counts;

    await Promise.all(
      modelIds.map(async (modelId) => {
        const qty = await prisma.branchInventory.count({
          where: branchPlanogramStockWhere(tenantId, stk.id, modelId),
        });
        counts.set(modelId, qty);
      }),
    );
    return counts;
  },

  /**
   * One page of serials SAP currently has on hand for the model.
   * Historical serials stay in the registry and are not listed here.
   * Branch code and name come from the warehouse on the on-hand read: Branch.sapCode,
   * or the one branch linked to that warehouse. A code that is not a branch still
   * shows that warehouse code, and the warehouse name when Warehouses already has it.
   * Inventory status still comes from a real stock placement. Branch qty is how many
   * of this model's on-hand serials share that branch, or that warehouse when no
   * branch matches. It is not the model total.
   */
  async listModelSerials(
    tenantId: string,
    modelId: string,
    page = 1,
    query?: string,
  ): Promise<ModelSerialPage> {
    const recorded = await prisma.serialNumber.findFirst({
      where: {
        tenantId,
        modelId,
        deletedAt: null,
        sapOnHandSyncedAt: { not: null },
      },
      select: { id: true },
    });
    if (!recorded) {
      return { items: [], total: 0, page: 1, totalPages: 1, onHandRecorded: false };
    }

    const term = query?.trim();
    const matchedBranchCodes = term ? await branchSapCodesMatching(tenantId, term) : [];
    const where: Prisma.SerialNumberWhereInput = {
      tenantId,
      modelId,
      deletedAt: null,
      model: { deletedAt: null },
      sapOnHand: true,
      ...(term
        ? {
            OR: [
              { serialNo: { contains: term, mode: "insensitive" as const } },
              ...(matchedBranchCodes.length > 0
                ? [{ sapWhsCode: { in: matchedBranchCodes } }]
                : []),
              {
                branchInventories: {
                  some: {
                    branch: {
                      OR: [
                        { name: { contains: term, mode: "insensitive" as const } },
                        { sapCode: { contains: term, mode: "insensitive" as const } },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const total = await prisma.serialNumber.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / MODEL_SERIAL_PAGE_SIZE));
    const currentPage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);

    const rows = await prisma.serialNumber.findMany({
      where,
      select: {
        id: true,
        serialNo: true,
        recordStatus: true,
        sapWhsCode: true,
        branchInventories: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            branch: { select: { id: true, sapCode: true, name: true } },
            statusCode: { select: { code: true, name: true, color: true } },
          },
        },
      },
      orderBy: [
        { sapWhsCode: { sort: "asc", nulls: "last" } },
        { serialNo: "asc" },
      ],
      skip: (currentPage - 1) * MODEL_SERIAL_PAGE_SIZE,
      take: MODEL_SERIAL_PAGE_SIZE,
    });

    const { branches: warehouseBranches, warehouseNames, qtyByBranchId, qtyByCode } =
      await onHandQtyByBranch(tenantId, modelId);

    return {
      items: rows.map((row) => {
        const current = row.branchInventories[0] ?? null;
        const warehouseBranch = row.sapWhsCode
          ? (warehouseBranches.get(row.sapWhsCode) ??
            warehouseBranches.get(row.sapWhsCode.trim()))
          : undefined;
        const warehouseName = row.sapWhsCode
          ? (warehouseNames.get(row.sapWhsCode) ?? warehouseNames.get(row.sapWhsCode.trim()) ?? null)
          : null;
        const branch = listedBranch(
          row.sapWhsCode,
          warehouseBranch,
          warehouseName,
          current?.branch ?? null,
        );
        const codeQty = row.sapWhsCode
          ? (qtyByCode.get(row.sapWhsCode) ?? qtyByCode.get(row.sapWhsCode.trim()) ?? 0)
          : null;
        return {
          id: row.id,
          serialNo: row.serialNo,
          recordStatus: row.recordStatus,
          branchCode: branch.branchCode,
          branchName: branch.branchName,
          branchQty: branch.branchId
            ? (qtyByBranchId.get(branch.branchId) ?? 0)
            : branch.branchCode
              ? codeQty
              : null,
          statusCode: current?.statusCode
            ? {
                code: current.statusCode.code,
                name: current.statusCode.name,
                color: current.statusCode.color,
              }
            : null,
        };
      }),
      total,
      page: currentPage,
      totalPages,
      onHandRecorded: true,
    };
  },
};

function laterTimestamp(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() >= right.getTime() ? left : right;
}
