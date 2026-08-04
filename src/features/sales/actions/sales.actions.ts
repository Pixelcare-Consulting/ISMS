"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { auditService } from "@/features/audit/services/audit.service";
import { aorService } from "@/features/aors/services/aor.service";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { salesRepository } from "@/features/sales/repositories/sales.repository";
import type {
  SalesListSort,
  SalesListSortDir,
} from "@/features/sales/repositories/sales.repository";
import {
  isToFollowSerial,
  TO_FOLLOW_SERIAL_ID,
  TO_FOLLOW_SERIAL_LABEL,
} from "@/features/sales/constants/to-follow-serial";
import {
  SALES_ACCESS_PERMISSIONS,
  SALES_CREATE,
  SALES_RETURN_APPROVE,
  SALES_RETURN_COMPLETE,
  SALES_RETURN_EVALUATE,
  SALES_RETURN_REQUEST,
  salesReturnRejectPermissions,
} from "@/features/sales/constants/sales-permissions";
import { isSaleTransactionNo } from "@/features/sales/utils/sale-transaction-no";
import {
  parseSaleProofPaths,
  serializeSaleProofPaths,
} from "@/features/sales/utils/sale-proof";
import { hasPermission, requireAnyPermission, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";
import { getObjectStorage } from "@/lib/storage";

export type SaleStatusCodeRef = {
  code: string;
  name: string;
  color: string | null;
};

const TO_FOLLOW_STATUS_FALLBACK: SaleStatusCodeRef = {
  code: "FW",
  name: "TO FOLLOW",
  color: "orange",
};

/** Tiny fallbacks when sales_atr Settings codes are missing (unseeded tenant). */
const SALES_ATR_STATUS_FALLBACK: Record<string, SaleStatusCodeRef> = {
  pending_cs: { code: "pending_cs", name: "Pending CS", color: "amber" },
  pending_tl: { code: "pending_tl", name: "Pending TL", color: "amber" },
  approved: { code: "approved", name: "Approved", color: "emerald" },
  rejected: { code: "rejected", name: "Rejected", color: "rose" },
  completed: { code: "completed", name: "Completed", color: "emerald" },
  open: { code: "open", name: "Open", color: "sky" },
  reserve: { code: "reserve", name: "Reserve", color: "amber" },
  closed: { code: "closed", name: "Closed", color: "slate" },
};

async function resolveToFollowStatusCode(
  tenantId: string,
): Promise<SaleStatusCodeRef> {
  const fw = await reasonStatusRepository.findCodeId(
    tenantId,
    "inventory_system",
    "FW",
  );
  if (!fw) return TO_FOLLOW_STATUS_FALLBACK;
  return { code: fw.code, name: fw.name, color: fw.color };
}

async function loadSalesAtrCodesByCode(
  tenantId: string,
): Promise<Map<string, SaleStatusCodeRef>> {
  const codes = await reasonStatusRepository.listActiveCodesByCategory(
    tenantId,
    "sales_atr",
    
  );
  return new Map(
    codes.map((row) => [
      row.code,
      { code: row.code, name: row.name, color: row.color },
    ]),
  );
}

function resolveSalesAtrStatusCode(
  code: string,
  codesByCode: Map<string, SaleStatusCodeRef>,
): SaleStatusCodeRef {
  return (
    codesByCode.get(code) ??
    SALES_ATR_STATUS_FALLBACK[code] ?? {
      code,
      name: code.replaceAll("_", " "),
      color: "amber",
    }
  );
}

/**
 * List/details STATUS preference (never live inventory):
 * 1) Active ATR return workflow (pending CS/TL/approved/rejected)
 * 2) Closed ATR header
 * 3) Frozen detail.statusCode (FW / SLD / RSV)
 * 4) Legacy derive from serial + atrStatus
 */
function resolveLineStatusCode(
  detail: {
    serialNumberId: string | null;
    statusCode?: { code: string; name: string; color: string | null } | null;
  },
  atrStatus: string,
  toFollowStatus: SaleStatusCodeRef,
  salesAtrCodes: Map<string, SaleStatusCodeRef>,
  returnStatus?: string | null,
): SaleStatusCodeRef | null {
  if (returnStatus && returnStatus !== "completed") {
    return resolveSalesAtrStatusCode(returnStatus, salesAtrCodes);
  }

  if (atrStatus === "closed") {
    return resolveSalesAtrStatusCode("closed", salesAtrCodes);
  }

  if (detail.statusCode) {
    return {
      code: detail.statusCode.code,
      name: detail.statusCode.name,
      color: detail.statusCode.color,
    };
  }

  if (!detail.serialNumberId) {
    if (atrStatus === "reserve") {
      return resolveSalesAtrStatusCode("reserve", salesAtrCodes);
    }
    return toFollowStatus;
  }
  return resolveSalesAtrStatusCode(atrStatus, salesAtrCodes);
}

const saleDetailSchema = z.object({
  packageTypeId: z.string().min(1),
  brandId: z.string().min(1),
  promoTypeId: z.string().optional(),
  modelId: z.string().min(1),
  // Accept either a real serial id or the TO-FOLLOW placeholder from the UI.
  serialNumberId: z.string().min(1),
  // 0 is allowed for free items; negatives are not.
  saleAmount: z.coerce.number().nonnegative(),
  modelPrice: z.coerce.number().nonnegative().optional(),
});

const saleSchema = z.object({
  transactionNo: z
    .string()
    .trim()
    .min(1)
    .refine(isSaleTransactionNo, "Invalid transaction number"),
  branchId: z.string().min(1),
  alternateBranchId: z.string().min(1),
  customerName: z.string().trim().min(1),
  contactNo: z.string().trim().max(50).optional(),
  siTrans: z.string().trim().min(1),
  paymentTypeId: z.string().min(1),
  saleTypeId: z.string().min(1),
  customerDeliveryMethodId: z.string().min(1),
  infoSlipVsoRrReleased: z.string().trim().optional(),
  rrReceiveDeliver: z.string().trim().optional(),
  // One path, or several (stored as Postgres text[] / Prisma String[]).
  proof: z
    .union([z.string().trim().min(1), z.array(z.string().trim().min(1))])
    .optional(),
  transactionDate: z.string().optional(),
  reserved: z.boolean().optional(),
  details: z.array(saleDetailSchema).min(1),
});

const SALES_PROOF_PREFIX = "sales-proofs";

async function assertBranchInAor(
  tenantId: string,
  userId: string,
  branchId: string,
  permissions: string[] | undefined,
) {
  const unrestricted =
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "master_data.manage");
  if (unrestricted) return;

  const branchIds = await aorService.getBranchIdsForUser(tenantId, userId);
  if (!branchIds?.includes(branchId)) {
    throw new Error("Branch not in your area of responsibility");
  }
}

/** Stock source must itself be within the user's area of responsibility. */
/** Stock source may be an alternate warehouse of an AOR branch. */
async function assertStockLocationReadable(
  tenantId: string,
  userId: string,
  stockBranchId: string,
  permissions: string[] | undefined,
) {
  const unrestricted =
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "master_data.manage");
  if (unrestricted) return;

  const branchIds = await aorService.getBranchIdsForUser(tenantId, userId);
  if (branchIds?.includes(stockBranchId)) return;

  const alt = await prisma.alternateWarehouse.findFirst({
    where: {
      alternateBranchId: stockBranchId,
      branchId: { in: branchIds ?? [] },
      branch: { tenantId },
    },
    select: { id: true },
  });
  if (!alt) {
    throw new Error("Branch not in your area of responsibility");
  }
}

/**
 * Stock source may be: the sold branch, an AlternateWarehouse of the sold branch,
 * or any other branch the user can read via AOR.
 */
async function assertValidStockSource(
  tenantId: string,
  userId: string,
  soldBranchId: string,
  alternateBranchId: string,
  permissions: string[] | undefined,
) {
  if (alternateBranchId === soldBranchId) return;

  const alt = await prisma.alternateWarehouse.findFirst({
    where: {
      branchId: soldBranchId,
      alternateBranchId,
      branch: { tenantId },
    },
    select: { id: true },
  });
  if (alt) return;

  await assertStockLocationReadable(
    tenantId,
    userId,
    alternateBranchId,
    permissions,
  );
}

/**
 * Mark a STK unit at the stock source as sold/reserved. When stock was taken
 * from an alternate branch, relocate the BranchInventory row to the sold branch
 * in the same update (same pattern as transfer receive).
 */
async function markSerialSoldFromStockSource(
  tx: Pick<typeof prisma, "branchInventory">,
  input: {
    tenantId: string;
    serialNumberId: string;
    stockBranchId: string;
    soldBranchId: string;
    stkCodeId: string;
    targetStatusCodeId: string;
    updatedById: string;
  },
) {
  const relocate = input.stockBranchId !== input.soldBranchId;
  const updated = await tx.branchInventory.updateMany({
    where: {
      tenantId: input.tenantId,
      serialNumberId: input.serialNumberId,
      branchId: input.stockBranchId,
      statusCodeId: input.stkCodeId,
    },
    data: {
      statusCodeId: input.targetStatusCodeId,
      updatedById: input.updatedById,
      ...(relocate ? { branchId: input.soldBranchId } : {}),
    },
  });
  if (updated.count === 0) {
    throw new Error("Serial is not in sellable stock at the stock source branch");
  }
}

/**
 * Restore a sold/reserved unit to STK at the stock source. Prefers the row at
 * the sold branch (post-relocate encode); falls back to stock source for legacy
 * rows that were never moved.
 */
async function restoreSerialToStockSource(
  tx: Pick<typeof prisma, "branchInventory">,
  input: {
    tenantId: string;
    serialNumberId: string;
    stockBranchId: string;
    soldBranchId: string;
    stkCodeId: string;
    soldStatusCodeIds: string[];
    updatedById: string;
  },
): Promise<string | null> {
  let oldInv = await tx.branchInventory.findFirst({
    where: {
      tenantId: input.tenantId,
      branchId: input.soldBranchId,
      serialNumberId: input.serialNumberId,
      statusCodeId: { in: input.soldStatusCodeIds },
    },
    select: { id: true, branchId: true, statusCodeId: true },
  });
  if (!oldInv && input.stockBranchId !== input.soldBranchId) {
    oldInv = await tx.branchInventory.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.stockBranchId,
        serialNumberId: input.serialNumberId,
        statusCodeId: { in: input.soldStatusCodeIds },
      },
      select: { id: true, branchId: true, statusCodeId: true },
    });
  }
  if (!oldInv) return null;

  await tx.branchInventory.update({
    where: { id: oldInv.id },
    data: {
      statusCodeId: input.stkCodeId,
      updatedById: input.updatedById,
      ...(oldInv.branchId !== input.stockBranchId
        ? { branchId: input.stockBranchId }
        : {}),
    },
  });
  return oldInv.statusCodeId;
}

const SALES_SORT_FIELDS = new Set<SalesListSort>([
  "transactionNo",
  "date",
  "branch",
  "customer",
  "amount",
  "atrStatus",
  "returnStatus",
]);

function parseSalesSort(value?: string): SalesListSort | undefined {
  if (value && SALES_SORT_FIELDS.has(value as SalesListSort)) {
    return value as SalesListSort;
  }
  return undefined;
}

function parseSalesSortDir(value?: string): SalesListSortDir | undefined {
  if (value === "asc" || value === "desc") return value;
  return undefined;
}

export async function listSalesAction(input?: {
  page?: number;
  limit?: number;
  sort?: string;
  sortDir?: string;
}) {
  const session = await requireAnyPermission([...SALES_ACCESS_PERMISSIONS]);
  const [result, toFollowStatus, salesAtrCodes] = await Promise.all([
    salesRepository.listDetailsForTenant(
      session.user.tenantId,
      {
        page: input?.page,
        limit: parseTablePageSize(input?.limit),
      },
      { field: parseSalesSort(input?.sort), dir: parseSalesSortDir(input?.sortDir) },
    ),
    resolveToFollowStatusCode(session.user.tenantId),
    loadSalesAtrCodesByCode(session.user.tenantId),
  ]);

  return {
    ...result,
    items: result.items.map((detail) => {
      const sale = detail.sale;
      const lineAmount = detail.saleAmount ?? detail.amount;
      const modelPrice = detail.modelPrice;
      return {
        // Row identity is the detail line (one serial / TO-FOLLOW per row).
        id: detail.id,
        detailId: detail.id,
        saleId: sale.id,
        transactionNo: sale.transactionNo,
        transactionDate: sale.transactionDate
          ? sale.transactionDate.toISOString()
          : null,
        customerName: sale.customerName,
        packageName: detail.packageType?.name ?? null,
        brandName: detail.brand?.name ?? null,
        modelLabel: detail.model
          ? detail.model.skuCode || detail.model.name
          : null,
        saleAmount: (lineAmount ?? 0).toString(),
        modelPrice: modelPrice != null ? modelPrice.toString() : null,
        atrStatus: sale.atrStatus,
        // Stock source drives edit-serial inventory picks; fall back to sold branch.
        branchId: sale.alternateBranchId ?? sale.branchId,
        branch: sale.branch,
        serialNumberId: detail.serialNumberId,
        serialNumber: detail.serialNumber
          ? { id: detail.serialNumber.id, serialNo: detail.serialNumber.serialNo }
          : null,
        statusCode: resolveLineStatusCode(
          detail,
          sale.atrStatus,
          toFollowStatus,
          salesAtrCodes,
          sale.returnRequest?.status,
        ),
        returnRequest: sale.returnRequest
          ? { id: sale.returnRequest.id, status: sale.returnRequest.status }
          : null,
      };
    }),
  };
}

export async function getSaleDetailsAction(saleId: string) {
  const session = await requireAnyPermission([...SALES_ACCESS_PERMISSIONS]);
  const [sale, toFollowStatus, salesAtrCodes] = await Promise.all([
    salesRepository.findSaleDetailsForTenant(session.user.tenantId, saleId),
    resolveToFollowStatusCode(session.user.tenantId),
    loadSalesAtrCodesByCode(session.user.tenantId),
  ]);

  if (!sale) {
    return { error: "Sale not found" as const };
  }

  const proofPaths = parseSaleProofPaths(sale.proof);
  const atrStatusCode = resolveSalesAtrStatusCode(sale.atrStatus, salesAtrCodes);
  const returnStatusCode = sale.returnRequest
    ? resolveSalesAtrStatusCode(sale.returnRequest.status, salesAtrCodes)
    : null;

  return {
    id: sale.id,
    transactionNo: sale.transactionNo,
    transactionDate: sale.transactionDate
      ? sale.transactionDate.toISOString()
      : null,
    customerName: sale.customerName,
    siTrans: sale.siTrans,
    atrStatus: sale.atrStatus,
    atrStatusCode,
    notes: sale.notes,
    proofPaths,
    proofCount: proofPaths.length,
    amount: sale.amount.toString(),
    /** Stock-source branch used when editing serials (matches list row branchId). */
    stockBranchId: sale.stockSourceBranch?.id ?? sale.branch.id,
    branch: sale.branch,
    stockSourceBranch: sale.stockSourceBranch,
    paymentType: sale.paymentType,
    saleType: sale.saleType,
    customerDeliveryMethod: sale.customerDeliveryMethod,
    returnRequest: sale.returnRequest
      ? { id: sale.returnRequest.id, status: sale.returnRequest.status }
      : null,
    returnStatusCode,
    createdByName: sale.createdBy?.name ?? sale.createdBy?.email ?? null,
    lines: sale.details.map((detail) => {
      const lineAmount = detail.saleAmount ?? detail.amount;
      return {
        detailId: detail.id,
        packageName: detail.packageType?.name ?? null,
        brandName: detail.brand?.name ?? null,
        modelId: detail.modelId ?? detail.model?.id ?? null,
        modelLabel: detail.model
          ? detail.model.skuCode?.trim() ||
            detail.model.name?.trim() ||
            null
          : null,
        serialNumberId: detail.serialNumberId,
        serialNo: detail.serialNumber?.serialNo ?? TO_FOLLOW_SERIAL_LABEL,
        saleAmount: (lineAmount ?? 0).toString(),
        modelPrice:
          detail.modelPrice != null ? detail.modelPrice.toString() : null,
        statusCode: resolveLineStatusCode(
          detail,
          sale.atrStatus,
          toFollowStatus,
          salesAtrCodes,
          sale.returnRequest?.status,
        ),
      };
    }),
  };
}

export async function listPackageTypesForSalesAction() {
  const session = await requirePermission("sales.create");
  const rows = await prisma.packageType.findMany({
    where: { tenantId: session.user.tenantId, recordStatus: "active" },
    select: { id: true, name: true, quantity: true },
    orderBy: { name: "asc" },
  });
  return rows;
}

export async function listPaymentTypesForSalesAction() {
  const session = await requirePermission("sales.create");
  return prisma.paymentType.findMany({
    where: { tenantId: session.user.tenantId, recordStatus: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listSaleTypesForSalesAction() {
  const session = await requirePermission("sales.create");
  return prisma.saleType.findMany({
    where: { tenantId: session.user.tenantId, recordStatus: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listCustomerDeliveryMethodsForSalesAction() {
  const session = await requirePermission("sales.create");
  return prisma.customerDeliveryMethod.findMany({
    where: { tenantId: session.user.tenantId, recordStatus: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listPromoTypesForSalesAction() {
  const session = await requirePermission("sales.create");
  return prisma.promoType.findMany({
    where: { tenantId: session.user.tenantId, recordStatus: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listBrandsForSalesAction() {
  const session = await requirePermission("sales.create");
  return prisma.brand.findMany({
    where: { tenantId: session.user.tenantId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listStockSourceBranchesForSalesAction(branchId: string) {
  const session = await requirePermission("sales.create");
  await assertBranchInAor(
    session.user.tenantId,
    session.user.id,
    branchId,
    session.user.permissions,
  );

  const tenantId = session.user.tenantId;
  const unrestricted =
    hasPermission(session.user.permissions, "branches.manage") ||
    hasPermission(session.user.permissions, "master_data.manage");

  // AOR-scoped branches first (same scope as Branch sold).
  const byId = new Map<string, string>();
  if (unrestricted) {
    const all = await prisma.branch.findMany({
      where: { tenantId, deletedAt: null, status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    for (const b of all) byId.set(b.id, b.name);
  } else {
    const aors = await aorService.listAorsForUser(tenantId, session.user.id);
    for (const aor of aors) {
      if (aor.branch?.id) {
        byId.set(aor.branch.id, aor.branch.name);
      }
    }
  }

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId },
    select: {
      id: true,
      name: true,
      alternateWarehouses: {
        select: {
          alternateBranch: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!branch) return [];

  // Ensure sold branch is present even if AOR rows were incomplete.
  byId.set(branch.id, branch.name);

  // Alternate warehouses of the sold branch (may sit outside AOR).
  for (const row of branch.alternateWarehouses) {
    if (row.alternateBranch.id === branch.id) continue;
    if (byId.has(row.alternateBranch.id)) continue;
    byId.set(
      row.alternateBranch.id,
      `${row.alternateBranch.name} (alternate)`,
    );
  }

  const candidateIds = [...byId.keys()];
  const stkCodeId = await reasonStatusService.requireCodeId(
    tenantId,
    "inventory_system",
    "STK",
  );
  // Only offer stock sources that actually hold sellable serials (plus sold branch for TO-FOLLOW).
  const stocked = await prisma.branchInventory.groupBy({
    by: ["branchId"],
    where: {
      tenantId,
      branchId: { in: candidateIds },
      statusCodeId: stkCodeId,
    },
    _count: { id: true },
  });
  const stockedIds = new Set(stocked.map((row) => row.branchId));

  const options = [...byId.entries()]
    .filter(([id]) => id === branch.id || stockedIds.has(id))
    .map(([id, name]) => ({ id, name }));

  // Sold branch first, then alphabetical.
  options.sort((a, b) => {
    if (a.id === branch.id) return -1;
    if (b.id === branch.id) return 1;
    return a.name.localeCompare(b.name);
  });
  return options;
}

export async function listModelsForSalesAction(brandId?: string) {
  const session = await requirePermission("sales.create");
  const rows = await prisma.productModel.findMany({
    where: {
      tenantId: session.user.tenantId,
      status: "active",
      ...(brandId ? { brandId } : {}),
    },
    select: { id: true, skuCode: true, name: true, srp: true, brandId: true },
    orderBy: { skuCode: "asc" },
    take: 500,
  });
  return rows.map((r) => ({
    id: r.id,
    skuCode: r.skuCode,
    name: r.name,
    brandId: r.brandId,
    srp: r.srp != null ? r.srp.toString() : null,
  }));
}

export type ResolvedModelPriceSource = "pricelist" | "pricelist_fallback";

export type ResolvedModelPrice = {
  amount: number;
  source: ResolvedModelPriceSource;
  /** Calendar day of the chosen price list period start (UTC YYYY-MM-DD). */
  periodStart: string;
};

function utcDayBounds(now: Date = new Date()) {
  // Date inputs store midnight UTC; treat the whole calendar day as in-range.
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dayEnd = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
  return { dayStart, dayEnd };
}

/**
 * Resolve Model price from master price lists only (no SRP / no manual override).
 * 1) Active row for as-of day (package-specific, then generic)
 * 2) Else latest row with periodStart <= as-of day (same package preference)
 * 3) Else null → caller locks amount at 0
 */
async function resolveModelPriceForSales(
  tenantId: string,
  modelId: string,
  packageTypeId?: string,
  asOf?: Date,
): Promise<ResolvedModelPrice | null> {
  const { dayStart, dayEnd } = utcDayBounds(asOf);
  const packageIds: Array<string | null> = packageTypeId
    ? [packageTypeId, null]
    : [null];

  for (const packageTypeFilter of packageIds) {
    const active = await prisma.priceList.findFirst({
      where: {
        tenantId,
        modelId,
        packageTypeId: packageTypeFilter,
        periodStart: { lte: dayEnd },
        periodEnd: { gte: dayStart },
      },
      orderBy: { periodStart: "desc" },
      select: { amount: true, periodStart: true },
    });
    if (active) {
      return {
        amount: Number(active.amount.toString()),
        source: "pricelist",
        periodStart: active.periodStart.toISOString().slice(0, 10),
      };
    }
  }

  for (const packageTypeFilter of packageIds) {
    const latest = await prisma.priceList.findFirst({
      where: {
        tenantId,
        modelId,
        packageTypeId: packageTypeFilter,
        periodStart: { lte: dayEnd },
      },
      orderBy: { periodStart: "desc" },
      select: { amount: true, periodStart: true },
    });
    if (latest) {
      return {
        amount: Number(latest.amount.toString()),
        source: "pricelist_fallback",
        periodStart: latest.periodStart.toISOString().slice(0, 10),
      };
    }
  }

  return null;
}

/**
 * Resolve Model price for a sales detail set (see resolveModelPriceForSales).
 */
export async function resolveModelPriceForSalesAction(input: {
  modelId: string;
  packageTypeId?: string;
  /** YYYY-MM-DD (or ISO); price list window uses this calendar day. */
  transactionDate?: string;
}): Promise<ResolvedModelPrice | null> {
  const session = await requirePermission("sales.create");
  const asOf = input.transactionDate
    ? new Date(input.transactionDate)
    : new Date();
  const asOfValid = Number.isNaN(asOf.getTime()) ? new Date() : asOf;
  return resolveModelPriceForSales(
    session.user.tenantId,
    input.modelId,
    input.packageTypeId,
    asOfValid,
  );
}

export async function listSaleableSerialsAction(
  branchId: string,
  modelId?: string,
) {
  const session = await requirePermission("sales.create");
  await assertStockLocationReadable(
    session.user.tenantId,
    session.user.id,
    branchId,
    session.user.permissions,
  );

  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );

  const rows = await prisma.branchInventory.findMany({
    where: {
      tenantId: session.user.tenantId,
      branchId,
      statusCodeId: stkCodeId,
      ...(modelId
        ? { serialNumber: { modelId } }
        : {}),
    },
    include: {
      serialNumber: {
        select: {
          id: true,
          serialNo: true,
          modelId: true,
          model: { select: { skuCode: true, name: true } },
        },
      },
    },
    orderBy: { serialNumber: { serialNo: "asc" } },
    take: 500,
  });

  return rows.map((r) => ({
    id: r.serialNumber.id,
    serialNo: r.serialNumber.serialNo,
    modelId: r.serialNumber.modelId,
    skuCode: r.serialNumber.model.skuCode,
    modelName: r.serialNumber.model.name,
  }));
}

export async function uploadSaleProofAction(formData: FormData) {
  const session = await requirePermission("sales.create");
  try {
    const files = formData
      .getAll("proof")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) {
      return { error: "No file selected" as const };
    }

    const storage = getObjectStorage();
    const paths: string[] = [];
    for (const file of files) {
      const fileId = crypto.randomUUID();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${SALES_PROOF_PREFIX}/tenants/${session.user.tenantId}/${fileId}-${safeName}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await storage.upload({
        path: storagePath,
        body: buffer,
        contentType: file.type || "application/octet-stream",
      });
      paths.push(storagePath);
    }

    return {
      success: true as const,
      path: paths[0]!,
      paths,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to upload proof",
    };
  }
}

export async function createSaleAction(input: unknown) {
  const session = await requirePermission("sales.create");
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid sale" };

  try {
    await assertBranchInAor(
      session.user.tenantId,
      session.user.id,
      parsed.data.branchId,
      session.user.permissions,
    );
    await assertValidStockSource(
      session.user.tenantId,
      session.user.id,
      parsed.data.branchId,
      parsed.data.alternateBranchId,
      session.user.permissions,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Access denied" };
  }

  let transactionDate: Date | null = null;
  if (parsed.data.transactionDate) {
    const d = new Date(parsed.data.transactionDate);
    if (Number.isNaN(d.getTime())) {
      return { error: "Invalid transaction date" };
    }
    transactionDate = d;
  }

  // Re-resolve model prices from master lists so clients cannot override.
  const details = await Promise.all(
    parsed.data.details.map(async (detail) => {
      const resolved = await resolveModelPriceForSales(
        session.user.tenantId,
        detail.modelId,
        detail.packageTypeId,
        transactionDate ?? undefined,
      );
      return {
        ...detail,
        modelPrice: resolved?.amount ?? 0,
      };
    }),
  );
  // TO-FOLLOW is not a stock unit — only real ids must be unique in one sale.
  const realSerialIds = details
    .map((d) => d.serialNumberId)
    .filter((id) => !isToFollowSerial(id));
  if (new Set(realSerialIds).size !== realSerialIds.length) {
    return { error: "Duplicate serials in the same transaction are not allowed" };
  }

  const taken = await prisma.branchSalesTransaction.findFirst({
    where: {
      tenantId: session.user.tenantId,
      transactionNo: parsed.data.transactionNo,
    },
    select: { id: true },
  });
  if (taken) {
    return { error: "Transaction number already used. Enter a different number." };
  }

  const transactionNo = parsed.data.transactionNo;
  const amount = details.reduce((sum, d) => sum + d.saleAmount, 0);
  const modelPriceRollup = details.find((d) => d.modelPrice != null)?.modelPrice;
  const stockBranchId = parsed.data.alternateBranchId;

  // Skip inventory status lookups when every line is TO-FOLLOW (no inventory move).
  const hasRealSerials = realSerialIds.length > 0;
  const hasToFollow = details.some((d) => isToFollowSerial(d.serialNumberId));
  const stkCodeId = hasRealSerials
    ? await reasonStatusService.requireCodeId(
        session.user.tenantId,
        "inventory_system",
        "STK",
      )
    : null;
  const targetStatusCodeId = hasRealSerials
    ? await reasonStatusService.requireCodeId(
        session.user.tenantId,
        "inventory_system",
        parsed.data.reserved ? "RSV" : "SLD",
      )
    : null;
  const fwCodeRow = hasToFollow
    ? await reasonStatusRepository.findCodeId(
        session.user.tenantId,
        "inventory_system",
        "FW",
      )
    : null;
  const fwCodeId = fwCodeRow?.id ?? null;

  let row;
  try {
    row = await prisma.$transaction(async (tx) => {
      const packageIds = [...new Set(details.map((d) => d.packageTypeId))];
      const brandIds = [...new Set(details.map((d) => d.brandId))];
      const promoIds = [
        ...new Set(
          details
            .map((d) => d.promoTypeId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      const [pkgs, brands, promos, payment, saleType, delivery] = await Promise.all([
        tx.packageType.findMany({
          where: {
            id: { in: packageIds },
            tenantId: session.user.tenantId,
            recordStatus: "active",
          },
          select: { id: true },
        }),
        tx.brand.findMany({
          where: { id: { in: brandIds }, tenantId: session.user.tenantId },
          select: { id: true },
        }),
        promoIds.length
          ? tx.promoType.findMany({
              where: {
                id: { in: promoIds },
                tenantId: session.user.tenantId,
                recordStatus: "active",
              },
              select: { id: true },
            })
          : Promise.resolve([]),
        tx.paymentType.findFirst({
          where: {
            id: parsed.data.paymentTypeId,
            tenantId: session.user.tenantId,
            recordStatus: "active",
          },
          select: { id: true },
        }),
        tx.saleType.findFirst({
          where: {
            id: parsed.data.saleTypeId,
            tenantId: session.user.tenantId,
            recordStatus: "active",
          },
          select: { id: true },
        }),
        tx.customerDeliveryMethod.findFirst({
          where: {
            id: parsed.data.customerDeliveryMethodId,
            tenantId: session.user.tenantId,
            recordStatus: "active",
          },
          select: { id: true },
        }),
      ]);

      if (pkgs.length !== packageIds.length) throw new Error("Package type not found");
      if (brands.length !== brandIds.length) throw new Error("Brand not found");
      if (promoIds.length && promos.length !== promoIds.length) {
        throw new Error("Promo type not found");
      }
      if (!payment) throw new Error("Payment type not found");
      if (!saleType) throw new Error("Sale type not found");
      if (!delivery) throw new Error("Customer delivery method not found");

      const created = await tx.branchSalesTransaction.create({
        data: {
          tenantId: session.user.tenantId,
          branchId: parsed.data.branchId,
          alternateBranchId: stockBranchId,
          paymentTypeId: parsed.data.paymentTypeId,
          saleTypeId: parsed.data.saleTypeId,
          customerDeliveryMethodId: parsed.data.customerDeliveryMethodId,
          transactionNo,
          transactionDate,
          customerName: parsed.data.customerName,
          contactNo: parsed.data.contactNo || null,
          siTrans: parsed.data.siTrans,
          infoSlipVsoRrReleased: parsed.data.infoSlipVsoRrReleased || null,
          rrReceiveDeliver: parsed.data.rrReceiveDeliver || null,
          proof: parsed.data.proof
            ? serializeSaleProofPaths(
                Array.isArray(parsed.data.proof)
                  ? parsed.data.proof
                  : [parsed.data.proof],
              )
            : [],
          amount,
          modelPrice: modelPriceRollup ?? null,
          atrStatus: "open",
          createdById: session.user.id,
        },
      });

      for (const detail of details) {
        const toFollow = isToFollowSerial(detail.serialNumberId);

        if (!toFollow) {
          // Real serial: STK at stock source → SLD/RSV at sold branch (relocate if alternate).
          if (!stkCodeId || !targetStatusCodeId) {
            throw new Error("Inventory status codes are not configured");
          }
          const serialNumberId = detail.serialNumberId;
          await markSerialSoldFromStockSource(tx, {
            tenantId: session.user.tenantId,
            serialNumberId,
            stockBranchId,
            soldBranchId: parsed.data.branchId,
            stkCodeId,
            targetStatusCodeId,
            updatedById: session.user.id,
          });

          await tx.branchSalesTransactionDetail.create({
            data: {
              salesId: created.id,
              packageTypeId: detail.packageTypeId,
              brandId: detail.brandId,
              promoTypeId: detail.promoTypeId ?? null,
              modelId: detail.modelId,
              serialNumberId,
              statusCodeId: targetStatusCodeId,
              saleAmount: detail.saleAmount,
              modelPrice: detail.modelPrice ?? null,
              amount: detail.saleAmount,
            },
          });
        } else {
          // TO-FOLLOW: keep the sale line, leave serial null, do not touch inventory.
          await tx.branchSalesTransactionDetail.create({
            data: {
              salesId: created.id,
              packageTypeId: detail.packageTypeId,
              brandId: detail.brandId,
              promoTypeId: detail.promoTypeId ?? null,
              modelId: detail.modelId,
              serialNumberId: null,
              statusCodeId: fwCodeId,
              saleAmount: detail.saleAmount,
              modelPrice: detail.modelPrice ?? null,
              amount: detail.saleAmount,
            },
          });
        }
      }

      return created;
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to record sale" };
  }

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: parsed.data.reserved ? "sale.reserved" : "sale.created",
    entityType: "BranchSalesTransaction",
    entityId: row.id,
    metadata: {
      transactionNo: row.transactionNo,
      reserved: Boolean(parsed.data.reserved),
      detailCount: details.length,
      toFollowCount: details.filter((d) => isToFollowSerial(d.serialNumberId)).length,
      placeholder: TO_FOLLOW_SERIAL_ID,
      stockSourceBranchId: stockBranchId,
    },
  });

  revalidatePath("/sales");
  revalidatePath("/sales/new");
  revalidatePath("/inventory");
  return { success: true as const };
}

export async function requestReturnAction(saleId: string, notes?: string) {
  const session = await requireAnyPermission([SALES_RETURN_REQUEST, SALES_CREATE]);
  const reason = notes?.trim() || "";
  if (!reason) {
    return { error: "Return reason is required" as const };
  }

  // Select only fields needed for ATR — avoid loading `proof` (text[]) on full-row reads.
  const sale = await prisma.branchSalesTransaction.findFirst({
    where: { id: saleId, tenantId: session.user.tenantId },
    select: {
      id: true,
      transactionNo: true,
      atrStatus: true,
      notes: true,
      returnRequest: { select: { id: true } },
    },
  });
  if (!sale) return { error: "Sale not found" as const };
  if (sale.returnRequest) return { error: "Return already requested" as const };
  if (sale.atrStatus !== "open") return { error: "Sale is not eligible for return" as const };

  await prisma.$transaction([
    prisma.branchReturnRequest.create({
      data: {
        tenantId: session.user.tenantId,
        saleId,
        requestedById: session.user.id,
        requestNotes: reason,
      },
    }),
    prisma.branchSalesTransaction.update({
      where: { id: saleId },
      data: {
        atrStatus: "reserve",
        notes: [sale.notes, `[Return requested] ${reason}`]
          .filter(Boolean)
          .join("\n"),
      },
    }),
  ]);

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sale.return_requested",
    entityType: "BranchSalesTransaction",
    entityId: saleId,
    metadata: {
      transactionNo: sale.transactionNo,
      atrStatus: "reserve",
      hasReason: true,
    },
  });

  revalidatePath("/sales");
  return { success: true as const };
}

export async function evaluateReturnAction(returnRequestId: string, notes?: string) {
  const session = await requirePermission(SALES_RETURN_EVALUATE);
  const row = await prisma.branchReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: session.user.tenantId },
  });
  if (!row || row.status !== "pending_cs") {
    return { error: "Return request not found or not pending CS evaluation" };
  }

  await prisma.branchReturnRequest.update({
    where: { id: returnRequestId },
    data: {
      status: "pending_tl",
      evaluatedById: session.user.id,
      evaluatedAt: new Date(),
      evaluationNotes: notes,
    },
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "return.evaluated",
    entityType: "BranchReturnRequest",
    entityId: returnRequestId,
  });

  revalidatePath("/sales");
  return { success: true as const };
}

export async function approveReturnAction(returnRequestId: string) {
  const session = await requireAnyPermission([SALES_RETURN_APPROVE, "orders.approve"]);
  const row = await prisma.branchReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: session.user.tenantId },
  });
  if (!row || row.status !== "pending_tl") {
    return { error: "Return request not found or not pending TL approval" };
  }

  await prisma.branchReturnRequest.update({
    where: { id: returnRequestId },
    data: {
      status: "approved",
      approvedById: session.user.id,
      approvedAt: new Date(),
    },
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "return.approved",
    entityType: "BranchReturnRequest",
    entityId: returnRequestId,
  });

  revalidatePath("/sales");
  return { success: true as const };
}

export async function rejectReturnAction(returnRequestId: string, notes?: string) {
  const session = await requireAnyPermission([
    SALES_RETURN_EVALUATE,
    SALES_RETURN_APPROVE,
    SALES_CREATE,
    "orders.approve",
  ]);
  const row = await prisma.branchReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: session.user.tenantId },
    include: { sale: true },
  });
  if (!row || !["pending_cs", "pending_tl"].includes(row.status)) {
    return { error: "Return request cannot be rejected" };
  }

  const allowed = salesReturnRejectPermissions(row.status);
  if (!allowed.some((slug) => hasPermission(session.user.permissions, slug))) {
    return { error: "You do not have permission to reject this return" };
  }

  await prisma.$transaction([
    prisma.branchReturnRequest.update({
      where: { id: returnRequestId },
      data: { status: "rejected", evaluationNotes: notes ?? row.evaluationNotes },
    }),
    prisma.branchSalesTransaction.update({
      where: { id: row.saleId },
      data: { atrStatus: "open" },
    }),
  ]);

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "return.rejected",
    entityType: "BranchReturnRequest",
    entityId: returnRequestId,
  });

  revalidatePath("/sales");
  return { success: true as const };
}

export async function completeReturnRestoreAction(returnRequestId: string) {
  const session = await requireAnyPermission([
    SALES_RETURN_COMPLETE,
    "logistics.manage",
    SALES_CREATE,
  ]);
  const row = await prisma.branchReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: session.user.tenantId },
    include: {
      sale: {
        include: {
          details: { select: { serialNumberId: true } },
        },
      },
    },
  });
  if (!row || row.status !== "approved") {
    return { error: "Return must be TL-approved before inventory restore" };
  }

  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );

  const stockBranchId = row.sale.alternateBranchId ?? row.sale.branchId;
  // Detail.serialNumberId is required in Prisma, but the live DB previously allowed
  // ON DELETE SET NULL — filter so restore never upserts a null serial key.
  const serialIds = [
    ...new Set(
      row.sale.details
        .map((d) => d.serialNumberId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  if (serialIds.length === 0) {
    return {
      error:
        "Cannot restore stock — this sale has no linked serial numbers. Check the sale details or contact support.",
    };
  }

  await prisma.$transaction(async (tx) => {
    for (const serialNumberId of serialIds) {
      // Prefer updating the existing row (often SLD at the sold branch after
      // alternate-stock encode) so we never leave an orphan SLD at branch B.
      const existing = await tx.branchInventory.findFirst({
        where: {
          tenantId: session.user.tenantId,
          serialNumberId,
        },
        select: { id: true },
      });
      if (existing) {
        await tx.branchInventory.update({
          where: { id: existing.id },
          data: {
            branchId: stockBranchId,
            statusCodeId: stkCodeId,
            updatedById: session.user.id,
          },
        });
      } else {
        await tx.branchInventory.create({
          data: {
            tenantId: session.user.tenantId,
            branchId: stockBranchId,
            serialNumberId,
            statusCodeId: stkCodeId,
            updatedById: session.user.id,
          },
        });
      }
    }
    await tx.branchReturnRequest.update({
      where: { id: returnRequestId },
      data: { status: "completed", completedAt: new Date() },
    });
    await tx.branchSalesTransaction.update({
      where: { id: row.saleId },
      data: { atrStatus: "closed" },
    });
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "return.completed",
    entityType: "BranchReturnRequest",
    entityId: returnRequestId,
    metadata: {
      transactionNo: row.sale.transactionNo,
      restoredSerialCount: serialIds.length,
    },
  });

  revalidatePath("/sales");
  revalidatePath("/inventory");
  return { success: true as const };
}

/**
 * Replace one sale-detail serial (per-line Edit). Defaults to the first detail
 * when detailId is omitted. Restores the old unit to STK at the stock source
 * (moving back from the sold branch when relocate encode applied), then marks
 * the new unit STK → SLD/RSV at the sold branch via the same helper as encode.
 */
export async function updateSaleSerialAction(input: {
  saleId: string;
  /** When set, only this detail line is updated. */
  detailId?: string;
  /** Real serial id, or TO-FOLLOW to clear the linked unit. */
  serialNumberId: string;
}) {
  const session = await requirePermission("sales.create");
  const nextIsToFollow = isToFollowSerial(input.serialNumberId);
  const nextSerialId = nextIsToFollow ? null : input.serialNumberId;

  const sale = await prisma.branchSalesTransaction.findFirst({
    where: { id: input.saleId, tenantId: session.user.tenantId },
    select: {
      id: true,
      transactionNo: true,
      branchId: true,
      alternateBranchId: true,
      details: {
        orderBy: { createdAt: "asc" },
        select: { id: true, serialNumberId: true },
      },
    },
  });
  if (!sale) return { error: "Sale not found" };
  if (sale.details.length === 0) return { error: "Sale has no detail lines" };

  try {
    await assertBranchInAor(
      session.user.tenantId,
      session.user.id,
      sale.branchId,
      session.user.permissions,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Access denied" };
  }

  const soldBranchId = sale.branchId;
  const stockBranchId = sale.alternateBranchId ?? sale.branchId;
  const targetDetail = input.detailId
    ? sale.details.find((d) => d.id === input.detailId)
    : sale.details[0];
  if (!targetDetail) return { error: "Sale detail line not found" };

  const oldSerialId = targetDetail.serialNumberId;
  if (oldSerialId === nextSerialId) {
    return { success: true as const };
  }

  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );
  const sldCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "SLD",
  );
  const rsvCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "RSV",
  );
  const fwCodeRow = nextIsToFollow
    ? await reasonStatusRepository.findCodeId(
        session.user.tenantId,
        "inventory_system",
        "FW",
      )
    : null;
  const fwCodeId = fwCodeRow?.id ?? null;

  try {
    await prisma.$transaction(async (tx) => {
      let soldStatusCodeId = sldCodeId;

      // Put the previous unit back to STK at stock source (sold branch first, then legacy).
      if (oldSerialId) {
        const previousStatusCodeId = await restoreSerialToStockSource(tx, {
          tenantId: session.user.tenantId,
          serialNumberId: oldSerialId,
          stockBranchId,
          soldBranchId,
          stkCodeId,
          soldStatusCodeIds: [sldCodeId, rsvCodeId],
          updatedById: session.user.id,
        });
        if (previousStatusCodeId === rsvCodeId) {
          soldStatusCodeId = rsvCodeId;
        }
      }

      // Assign a real serial: STK at stock source → SLD/RSV at sold branch.
      if (nextSerialId) {
        await markSerialSoldFromStockSource(tx, {
          tenantId: session.user.tenantId,
          serialNumberId: nextSerialId,
          stockBranchId,
          soldBranchId,
          stkCodeId,
          targetStatusCodeId: soldStatusCodeId,
          updatedById: session.user.id,
        });
      }

      await tx.branchSalesTransactionDetail.update({
        where: { id: targetDetail.id },
        data: {
          serialNumberId: nextSerialId,
          // Freeze line STATUS with the sale — do not mirror inventory after ATR complete.
          statusCodeId: nextSerialId ? soldStatusCodeId : fwCodeId,
        },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update serial" };
  }

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sale.serial_updated",
    entityType: "BranchSalesTransaction",
    entityId: sale.id,
    metadata: {
      transactionNo: sale.transactionNo,
      detailId: targetDetail.id,
      fromSerialId: oldSerialId,
      toSerialId: nextSerialId,
      toFollow: nextIsToFollow,
      stockSourceBranchId: stockBranchId,
    },
  });

  revalidatePath("/sales");
  revalidatePath("/inventory");
  return { success: true as const };
}

export async function listStkSerialsForBranchAction(branchId: string) {
  const session = await requireAnyPermission(["logistics.manage", "orders.create", "sales.create"]);

  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );

  const rows = await prisma.branchInventory.findMany({
    where: {
      tenantId: session.user.tenantId,
      branchId,
      statusCodeId: stkCodeId,
    },
    include: {
      serialNumber: {
        select: {
          id: true,
          serialNo: true,
          model: { select: { skuCode: true, name: true } },
        },
      },
    },
    orderBy: { serialNumber: { serialNo: "asc" } },
    take: 200,
  });

  return rows.map((r) => ({
    id: r.serialNumber.id,
    serialNo: r.serialNumber.serialNo,
    skuCode: r.serialNumber.model.skuCode,
    modelName: r.serialNumber.model.name,
  }));
}
