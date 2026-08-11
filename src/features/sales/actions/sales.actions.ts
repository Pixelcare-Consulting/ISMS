"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { auditService } from "@/features/audit/services/audit.service";
import { aorService } from "@/features/aors/services/aor.service";
import {
  markSerialSoldFromStockSource,
  restoreSerialToStockSource,
} from "@/features/inventory/services/inventory-serial-moves";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { salesRepository } from "@/features/sales/repositories/sales.repository";
import type {
  SalesListSort,
  SalesListSortDir,
  SalesReturnsListSort,
} from "@/features/sales/repositories/sales.repository";
import {
  isToFollowSerial,
  TO_FOLLOW_SERIAL_ID,
  TO_FOLLOW_SERIAL_LABEL,
} from "@/features/sales/constants/to-follow-serial";
import { isServiceReturnDocumentTypeName } from "@/features/sales/constants/process-return";
import { generateAndStoreAtrOdrfPdf } from "@/features/sales/services/atr-odrf-pdf";
import {
  SALES_ACCESS_PERMISSIONS,
  SALES_CREATE,
  SALES_LIST_PERMISSIONS,
  SALES_LOOKUP_PERMISSIONS,
  SALES_RETURN_APPROVE,
  SALES_RETURN_COMPLETE,
  SALES_RETURN_EVALUATE,
  SALES_RETURN_REQUEST,
  SALES_UPDATE,
  salesReturnRejectPermissions,
} from "@/features/sales/constants/sales-permissions";
import {
  RETURNS_APPROVE,
  RETURNS_APPROVALS_VIEW_PERMISSIONS,
  RETURNS_BRANCH_VIEW_PERMISSIONS,
  RETURNS_COMPLETE,
  RETURNS_EVALUATE,
  RETURNS_REQUEST,
  returnsRejectPermissions,
} from "@/features/returns/constants/returns-permissions";
import { capturesDeliveryReceipt } from "@/features/sales/utils/delivery-method";
import { saleHasOfficialSoldLine } from "@/features/sales/utils/sale-header-edit";
import { isSaleTransactionNo } from "@/features/sales/utils/sale-transaction-no";
import {
  resolveModelPriceForSales,
  type ResolvedModelPrice,
} from "@/features/sales/services/model-price";
import {
  parseSaleProofPaths,
  serializeSaleProofPaths,
} from "@/features/sales/utils/sale-proof";
import { hasPermission, requireAnyPermission, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";
import { getObjectStorage } from "@/lib/storage";

export type {
  ResolvedModelPrice,
  ResolvedModelPriceSource,
} from "@/features/sales/services/model-price";

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

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `<input type="date">` value → UTC-midnight Date. Anchoring to UTC keeps the
 * stored day identical to the day the user picked, whatever the server zone is.
 */
function parseDateInputValue(value: string): Date | null {
  if (!DATE_INPUT_PATTERN.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** Inverse of parseDateInputValue, for pre-filling a date input. */
function toDateInputValue(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

const deliveryNoSchema = z.string().trim().max(100);

/** Blank clears the date; anything else must be a real calendar day. */
const deliveryDateSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || parseDateInputValue(value) !== null,
    "Invalid delivery date",
  )
  .transform((value) => (value === "" ? null : parseDateInputValue(value)));

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
  deliveryNo: deliveryNoSchema.optional(),
  deliveryDate: deliveryDateSchema.optional(),
});

/**
 * Per-line Edit. Delivery fields are omit-to-keep / blank-to-clear, so they
 * land as `undefined` (Prisma skips the column) or `null` (Prisma clears it).
 */
const updateSaleSerialSchema = z.object({
  saleId: z.string().min(1),
  /** When set, only this detail line is updated. */
  detailId: z.string().min(1).optional(),
  /** Real serial id, or TO-FOLLOW to clear the linked unit. */
  serialNumberId: z.string().min(1),
  deliveryNo: deliveryNoSchema.transform((value) => value || null).optional(),
  deliveryDate: deliveryDateSchema.optional(),
});

/** Header-only edit (Accounting). Does not create/remove sale lines. */
const updateSaleHeaderSchema = z.object({
  saleId: z.string().min(1),
  transactionNo: z
    .string()
    .trim()
    .min(1)
    .refine(isSaleTransactionNo, "Invalid transaction number"),
  branchId: z.string().min(1),
  alternateBranchId: z.string().min(1),
  customerName: z.string().trim().min(1),
  contactNo: z.string().trim().max(50).optional(),
  siTrans: z.string().trim().optional(),
  paymentTypeId: z.string().min(1),
  saleTypeId: z.string().min(1),
  customerDeliveryMethodId: z.string().min(1),
  infoSlipVsoRrReleased: z.string().trim().optional(),
  rrReceiveDeliver: z.string().trim().optional(),
  proof: z
    .union([z.string().trim().min(1), z.array(z.string().trim().min(1))])
    .optional(),
  transactionDate: z.string().optional(),
  reserved: z.boolean().optional(),
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
  /** Optional — defaults to transactionNo when omitted (same value; UI no longer collects it). */
  siTrans: z.string().trim().optional(),
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

const SALES_SORT_FIELDS = new Set<SalesListSort>([
  "transactionNo",
  "date",
  "branch",
  "customer",
  "amount",
  "atrStatus",
  "returnStatus",
]);

const SALES_RETURNS_SORT_FIELDS = new Set<SalesReturnsListSort>([
  "transactionNo",
  "date",
  "branch",
  "customer",
  "amount",
  "atrStatus",
  "returnStatus",
  "createdAt",
]);

function parseSalesSort(value?: string): SalesListSort | undefined {
  if (value && SALES_SORT_FIELDS.has(value as SalesListSort)) {
    return value as SalesListSort;
  }
  return undefined;
}

function parseSalesReturnsSort(value?: string): SalesReturnsListSort | undefined {
  if (value && SALES_RETURNS_SORT_FIELDS.has(value as SalesReturnsListSort)) {
    return value as SalesReturnsListSort;
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
  const session = await requireAnyPermission([...SALES_LIST_PERMISSIONS]);
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

/**
 * Branch returns list: one row per BranchReturnRequest with ATR / return status badges.
 * Branch tab: `returns.branch.view` / umbrella / legacy.
 * Approvals queue (`statusIn`): evaluate / approve / complete (no separate approvals.view).
 */
export async function listSalesReturnsAction(input?: {
  page?: number;
  limit?: number;
  sort?: string;
  sortDir?: string;
  statusIn?: Array<"pending_cs" | "pending_tl" | "approved" | "rejected" | "completed">;
}) {
  const forApprovalsQueue = Boolean(input?.statusIn?.length);
  const session = await requireAnyPermission(
    forApprovalsQueue
      ? [...RETURNS_APPROVALS_VIEW_PERMISSIONS]
      : [...RETURNS_BRANCH_VIEW_PERMISSIONS],
  );
  const [result, salesAtrCodes] = await Promise.all([
    salesRepository.listReturnRequestsForTenant(
      session.user.tenantId,
      {
        page: input?.page,
        limit: parseTablePageSize(input?.limit),
      },
      {
        field: parseSalesReturnsSort(input?.sort),
        dir: parseSalesSortDir(input?.sortDir),
      },
      { statusIn: input?.statusIn },
    ),
    loadSalesAtrCodesByCode(session.user.tenantId),
  ]);

  return {
    ...result,
    items: result.items.map((row) => {
      const sale = row.sale;
      const firstDetail = sale.details[0];
      const replacement = sale.replacements[0] ?? null;
      const origModelLabel = firstDetail?.model
        ? [firstDetail.model.skuCode, firstDetail.model.name]
            .filter(Boolean)
            .join(" · ")
        : null;
      const origSerialNos = sale.details
        .map((d) => d.serialNumber?.serialNo)
        .filter((v): v is string => Boolean(v));
      const origPrice =
        firstDetail?.modelPrice?.toString() ??
        firstDetail?.saleAmount?.toString() ??
        sale.amount.toString();

      return {
        id: row.id,
        returnRequestId: row.id,
        saleId: sale.id,
        transactionNo: sale.transactionNo,
        transactionDate: sale.transactionDate
          ? sale.transactionDate.toISOString()
          : null,
        customerName: sale.customerName,
        amount: sale.amount.toString(),
        atrStatus: sale.atrStatus,
        atrStatusCode: resolveSalesAtrStatusCode(sale.atrStatus, salesAtrCodes),
        returnStatus: row.status,
        returnStatusCode: resolveSalesAtrStatusCode(row.status, salesAtrCodes),
        actionType: row.actionType ?? "return",
        stockStatusCode: row.stockStatusCode ?? "STK",
        documentTypeName: row.documentType?.name ?? null,
        requestNotes: row.requestNotes,
        problemDescriptionText: row.problemDescriptionText,
        dealerRsNo: row.dealerRsNo,
        actualDateReturned: row.actualDateReturned
          ? row.actualDateReturned.toISOString()
          : null,
        atrOdrfPdfPath: row.atrOdrfPdfPath,
        hasAtrOdrfPdf: Boolean(row.atrOdrfPdfPath),
        origModelLabel,
        origSerialNo: origSerialNos[0] ?? null,
        origSerialNos,
        origPrice,
        replSerialNo: replacement?.replacementSerialNumber?.serialNo ?? null,
        replBranchName: replacement?.replacementBranch?.name ?? null,
        replAmount: replacement?.replacementAmount?.toString() ?? null,
        replInvoiceNo: replacement?.replacementInvoiceNo ?? null,
        createdAt: row.createdAt.toISOString(),
        branch: sale.branch,
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

  const realSerialDetails = sale.details.filter((d) => d.serialNumberId);
  const reserved =
    realSerialDetails.length > 0 &&
    realSerialDetails.every((d) => d.statusCode?.code === "RSV");

  return {
    id: sale.id,
    transactionNo: sale.transactionNo,
    transactionDate: sale.transactionDate
      ? sale.transactionDate.toISOString()
      : null,
    /** YYYY-MM-DD for header edit date input. */
    transactionDateInput: toDateInputValue(sale.transactionDate),
    customerName: sale.customerName,
    contactNo: sale.contactNo,
    siTrans: sale.siTrans,
    infoSlipVsoRrReleased: sale.infoSlipVsoRrReleased,
    rrReceiveDeliver: sale.rrReceiveDeliver,
    atrStatus: sale.atrStatus,
    atrStatusCode,
    notes: sale.notes,
    proofPaths,
    proofCount: proofPaths.length,
    amount: sale.amount.toString(),
    reserved,
    /** Stock-source branch used when editing serials (matches list row branchId). */
    stockBranchId: sale.stockSourceBranch?.id ?? sale.branch.id,
    branchId: sale.branchId,
    alternateBranchId: sale.alternateBranchId ?? sale.branchId,
    paymentTypeId: sale.paymentTypeId,
    saleTypeId: sale.saleTypeId,
    customerDeliveryMethodId: sale.customerDeliveryMethodId,
    branch: sale.branch,
    stockSourceBranch: sale.stockSourceBranch,
    paymentType: sale.paymentType,
    saleType: sale.saleType,
    customerDeliveryMethod: sale.customerDeliveryMethod,
    returnRequest: sale.returnRequest
      ? {
          id: sale.returnRequest.id,
          status: sale.returnRequest.status,
          actionType: sale.returnRequest.actionType ?? "return",
          stockStatusCode: sale.returnRequest.stockStatusCode ?? "STK",
          hasAtrOdrfPdf: Boolean(sale.returnRequest.atrOdrfPdfPath),
        }
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
        deliveryNo: detail.deliveryNo,
        // YYYY-MM-DD so <input type="date"> round-trips without timezone drift.
        deliveryDate: toDateInputValue(detail.deliveryDate),
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
  const session = await requireAnyPermission([...SALES_LOOKUP_PERMISSIONS]);
  const rows = await prisma.packageType.findMany({
    where: { tenantId: session.user.tenantId, recordStatus: "active" },
    select: { id: true, name: true, quantity: true },
    orderBy: { name: "asc" },
  });
  return rows;
}

export async function listPaymentTypesForSalesAction() {
  const session = await requireAnyPermission([...SALES_LOOKUP_PERMISSIONS]);
  return prisma.paymentType.findMany({
    where: { tenantId: session.user.tenantId, recordStatus: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listSaleTypesForSalesAction() {
  const session = await requireAnyPermission([...SALES_LOOKUP_PERMISSIONS]);
  return prisma.saleType.findMany({
    where: { tenantId: session.user.tenantId, recordStatus: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listCustomerDeliveryMethodsForSalesAction() {
  const session = await requireAnyPermission([...SALES_LOOKUP_PERMISSIONS]);
  return prisma.customerDeliveryMethod.findMany({
    where: { tenantId: session.user.tenantId, recordStatus: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listPromoTypesForSalesAction() {
  const session = await requireAnyPermission([...SALES_LOOKUP_PERMISSIONS]);
  return prisma.promoType.findMany({
    where: { tenantId: session.user.tenantId, recordStatus: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listBrandsForSalesAction() {
  const session = await requireAnyPermission([...SALES_LOOKUP_PERMISSIONS]);
  return prisma.brand.findMany({
    where: { tenantId: session.user.tenantId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** AOR-scoped sold branches for encode / header edit. */
export async function listBranchesForSalesAction() {
  const session = await requireAnyPermission([...SALES_LOOKUP_PERMISSIONS]);
  const unrestricted =
    hasPermission(session.user.permissions, "branches.manage") ||
    hasPermission(session.user.permissions, "master_data.manage");

  if (unrestricted) {
    return prisma.branch.findMany({
      where: {
        tenantId: session.user.tenantId,
        deletedAt: null,
        status: "active",
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  const aors = await aorService.listAorsForUser(
    session.user.tenantId,
    session.user.id,
  );
  const byId = new Map<string, string>();
  for (const aor of aors) {
    if (aor.branch?.id) {
      byId.set(aor.branch.id, aor.branch.name);
    }
  }
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listStockSourceBranchesForSalesAction(branchId: string) {
  const session = await requireAnyPermission([...SALES_LOOKUP_PERMISSIONS]);
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
  const session = await requireAnyPermission([...SALES_LOOKUP_PERMISSIONS]);
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
  const session = await requireAnyPermission([...SALES_LOOKUP_PERMISSIONS]);
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
      branchId: parsed.data.branchId,
      transactionNo: parsed.data.transactionNo,
    },
    select: { id: true },
  });
  if (taken) {
    return {
      error:
        "Transaction number already used on this branch. Enter a different number.",
    };
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
          select: { id: true, name: true },
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

      // Pickup sales never produce a delivery receipt — drop anything the
      // client sent rather than trusting the form to have hidden the fields.
      const keepsDeliveryReceipt = capturesDeliveryReceipt(delivery.name);

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
          siTrans: parsed.data.siTrans || transactionNo,
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
              deliveryNo: keepsDeliveryReceipt ? detail.deliveryNo || null : null,
              deliveryDate: keepsDeliveryReceipt
                ? (detail.deliveryDate ?? null)
                : null,
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
              deliveryNo: keepsDeliveryReceipt ? detail.deliveryNo || null : null,
              deliveryDate: keepsDeliveryReceipt
                ? (detail.deliveryDate ?? null)
                : null,
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

export async function listProcessReturnLookupsAction() {
  const session = await requireAnyPermission([
    RETURNS_REQUEST,
    SALES_RETURN_REQUEST,
    SALES_CREATE,
  ]);
  const tenantId = session.user.tenantId;

  const [documentTypes, problemDescriptions, serviceCenters, models, warehouseLocations] =
    await Promise.all([
      prisma.documentType.findMany({
        where: { tenantId, recordStatus: "active" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.problemDescription.findMany({
        where: { tenantId, recordStatus: "active" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.serviceCenter.findMany({
        where: { tenantId, deletedAt: null, status: "active" },
        select: { id: true, name: true, sapCode: true },
        orderBy: { name: "asc" },
      }),
      prisma.productModel.findMany({
        where: { tenantId, status: "active" },
        select: { id: true, skuCode: true, name: true },
        orderBy: { skuCode: "asc" },
        take: 1000,
      }),
      prisma.warehouseLocation.findMany({
        where: {
          warehouse: { tenantId },
        },
        select: {
          id: true,
          code: true,
          name: true,
          warehouse: { select: { name: true, code: true } },
        },
        orderBy: [{ warehouse: { name: "asc" } }, { name: "asc" }],
        take: 1000,
      }),
    ]);

  return {
    documentTypes,
    problemDescriptions,
    serviceCenters: serviceCenters.map((sc) => ({
      id: sc.id,
      name: sc.sapCode ? `${sc.sapCode} · ${sc.name}` : sc.name,
    })),
    models: models.map((m) => ({
      id: m.id,
      name: m.skuCode ? `${m.skuCode} · ${m.name}` : m.name,
    })),
    warehouseLocations: warehouseLocations.map((loc) => ({
      id: loc.id,
      name: [
        loc.warehouse.code || loc.warehouse.name,
        loc.code || loc.name,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
  };
}

const processReturnPayloadSchema = z.object({
  documentTypeId: z.string().min(1),
  stockStatusCode: z.enum(["STK", "DEF"]),
  actionType: z.enum(["return", "replacement"]),
  problemDescriptionIds: z.array(z.string().min(1)).min(1),
  serviceCenterId: z.string().optional().nullable(),
  classification: z.string().trim().optional().nullable(),
  serviceModelId: z.string().optional().nullable(),
  customerDealerBranch: z.string().trim().optional().nullable(),
  natureOfTransaction: z.string().trim().optional().nullable(),
  refContactPo: z.string().trim().optional().nullable(),
  warehouseLocationId: z.string().optional().nullable(),
});

export type ProcessReturnPayload = z.infer<typeof processReturnPayloadSchema>;

export async function requestReturnAction(
  saleId: string,
  payload: ProcessReturnPayload | string,
) {
  const session = await requireAnyPermission([
    RETURNS_REQUEST,
    SALES_RETURN_REQUEST,
    SALES_CREATE,
  ]);

  // Legacy callers may still pass a free-text reason string — reject with guidance.
  if (typeof payload === "string") {
    return {
      error:
        "Process Return requires document type, stock status, and problem description" as const,
    };
  }

  const parsed = processReturnPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: "Invalid process return details" as const };
  }
  const data = parsed.data;

  const documentType = await prisma.documentType.findFirst({
    where: {
      id: data.documentTypeId,
      tenantId: session.user.tenantId,
      recordStatus: "active",
    },
    select: { id: true, name: true },
  });
  if (!documentType) {
    return { error: "Document type not found or inactive" as const };
  }

  const problems = await prisma.problemDescription.findMany({
    where: {
      tenantId: session.user.tenantId,
      recordStatus: "active",
      id: { in: data.problemDescriptionIds },
    },
    select: { id: true, name: true },
  });
  if (problems.length === 0) {
    return { error: "Select at least one problem description" as const };
  }
  // Preserve UI selection order for joined text + primary FK.
  const problemById = new Map(problems.map((p) => [p.id, p]));
  const orderedProblems = data.problemDescriptionIds
    .map((id) => problemById.get(id))
    .filter((p): p is { id: string; name: string } => Boolean(p));
  if (orderedProblems.length === 0) {
    return { error: "Select at least one problem description" as const };
  }
  const problemDescriptionText = orderedProblems.map((p) => p.name).join("; ");
  const problemDescriptionId = orderedProblems[0]!.id;

  const serviceReturn = isServiceReturnDocumentTypeName(documentType.name);
  if (serviceReturn && !data.serviceCenterId?.trim()) {
    return { error: "Service center is required for Service Return" as const };
  }

  if (data.serviceCenterId) {
    const sc = await prisma.serviceCenter.findFirst({
      where: {
        id: data.serviceCenterId,
        tenantId: session.user.tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!sc) return { error: "Service center not found" as const };
  }
  if (data.serviceModelId) {
    const model = await prisma.productModel.findFirst({
      where: {
        id: data.serviceModelId,
        tenantId: session.user.tenantId,
        status: "active",
      },
      select: { id: true },
    });
    if (!model) return { error: "Service model not found" as const };
  }
  if (data.warehouseLocationId) {
    const loc = await prisma.warehouseLocation.findFirst({
      where: {
        id: data.warehouseLocationId,
        warehouse: { tenantId: session.user.tenantId },
      },
      select: { id: true },
    });
    if (!loc) return { error: "Warehouse location not found" as const };
  }

  const sale = await prisma.branchSalesTransaction.findFirst({
    where: { id: saleId, tenantId: session.user.tenantId },
    select: {
      id: true,
      transactionNo: true,
      transactionDate: true,
      customerName: true,
      atrStatus: true,
      notes: true,
      branch: { select: { name: true } },
      returnRequest: { select: { id: true } },
      details: {
        orderBy: { createdAt: "asc" },
        select: {
          saleAmount: true,
          amount: true,
          model: { select: { skuCode: true, name: true } },
          serialNumber: { select: { serialNo: true } },
        },
      },
    },
  });
  if (!sale) return { error: "Sale not found" as const };
  if (sale.returnRequest) return { error: "Return already requested" as const };
  if (sale.atrStatus !== "open") {
    return { error: "Sale is not eligible for return" as const };
  }

  const summaryNote = `[${data.actionType === "replacement" ? "Replacement" : "Return"} requested] ${documentType.name} · ${data.stockStatusCode} · ${problemDescriptionText}`;

  const created = await prisma.$transaction(async (tx) => {
    const returnRequest = await tx.branchReturnRequest.create({
      data: {
        tenantId: session.user.tenantId,
        saleId,
        requestedById: session.user.id,
        actionType: data.actionType,
        stockStatusCode: data.stockStatusCode,
        documentTypeId: documentType.id,
        problemDescriptionId,
        problemDescriptionText,
        requestNotes: problemDescriptionText,
        serviceCenterId: serviceReturn ? data.serviceCenterId || null : null,
        classification: serviceReturn
          ? data.classification?.trim() || null
          : null,
        serviceModelId: serviceReturn ? data.serviceModelId || null : null,
        customerDealerBranch: serviceReturn
          ? data.customerDealerBranch?.trim() || null
          : null,
        natureOfTransaction: serviceReturn
          ? data.natureOfTransaction?.trim() || null
          : null,
        refContactPo: serviceReturn ? data.refContactPo?.trim() || null : null,
        warehouseLocationId: serviceReturn
          ? data.warehouseLocationId || null
          : null,
      },
      select: { id: true, createdAt: true },
    });

    await tx.branchSalesTransaction.update({
      where: { id: saleId },
      data: {
        atrStatus: "reserve",
        notes: [sale.notes, summaryNote].filter(Boolean).join("\n"),
      },
    });

    return returnRequest;
  });

  // Best-effort ATR/ODRF PDF — return still succeeds if PDF generation fails.
  let atrOdrfPdfPath: string | null = null;
  try {
    const [serviceCenter, serviceModel, warehouseLocation, requester] =
      await Promise.all([
        data.serviceCenterId
          ? prisma.serviceCenter.findFirst({
              where: { id: data.serviceCenterId },
              select: { name: true, sapCode: true },
            })
          : Promise.resolve(null),
        data.serviceModelId
          ? prisma.productModel.findFirst({
              where: { id: data.serviceModelId },
              select: { skuCode: true, name: true },
            })
          : Promise.resolve(null),
        data.warehouseLocationId
          ? prisma.warehouseLocation.findFirst({
              where: { id: data.warehouseLocationId },
              select: {
                code: true,
                name: true,
                warehouse: { select: { name: true, code: true } },
              },
            })
          : Promise.resolve(null),
        prisma.user.findFirst({
          where: { id: session.user.id },
          select: { name: true, email: true },
        }),
      ]);

    atrOdrfPdfPath = await generateAndStoreAtrOdrfPdf({
      tenantId: session.user.tenantId,
      returnRequestId: created.id,
      data: {
        documentTitle: "ATR / ODRF",
        actionTypeLabel:
          data.actionType === "replacement" ? "Replacement" : "Return",
        transactionNo: sale.transactionNo,
        transactionDate: sale.transactionDate
          ? sale.transactionDate.toLocaleDateString()
          : null,
        branchName: sale.branch.name,
        customerName: sale.customerName,
        documentTypeName: documentType.name,
        stockStatusCode: data.stockStatusCode,
        problemDescriptionText,
        requestedByName: requester?.name ?? requester?.email ?? session.user.id,
        requestedAt: created.createdAt.toLocaleString(),
        serviceCenterName: serviceCenter
          ? serviceCenter.sapCode
            ? `${serviceCenter.sapCode} · ${serviceCenter.name}`
            : serviceCenter.name
          : null,
        classification: data.classification,
        serviceModelLabel: serviceModel
          ? serviceModel.skuCode
            ? `${serviceModel.skuCode} · ${serviceModel.name}`
            : serviceModel.name
          : null,
        customerDealerBranch: data.customerDealerBranch,
        natureOfTransaction: data.natureOfTransaction,
        refContactPo: data.refContactPo,
        warehouseLocationLabel: warehouseLocation
          ? [
              warehouseLocation.warehouse.code || warehouseLocation.warehouse.name,
              warehouseLocation.code || warehouseLocation.name,
            ]
              .filter(Boolean)
              .join(" · ")
          : null,
        lines: sale.details.map((d) => ({
          modelLabel: d.model
            ? d.model.skuCode || d.model.name || "—"
            : "—",
          serialNo: d.serialNumber?.serialNo ?? TO_FOLLOW_SERIAL_LABEL,
          saleAmount: (d.saleAmount ?? d.amount ?? 0).toString(),
        })),
      },
    });

    await prisma.branchReturnRequest.update({
      where: { id: created.id },
      data: { atrOdrfPdfPath },
    });
  } catch {
    // Keep the return request even when PDF storage fails.
  }

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sale.return_requested",
    entityType: "BranchSalesTransaction",
    entityId: saleId,
    metadata: {
      transactionNo: sale.transactionNo,
      atrStatus: "reserve",
      actionType: data.actionType,
      stockStatusCode: data.stockStatusCode,
      documentTypeId: documentType.id,
      returnRequestId: created.id,
      hasAtrOdrfPdf: Boolean(atrOdrfPdfPath),
    },
  });

  revalidatePath("/sales");
  revalidatePath("/returns");
  return { success: true as const, returnRequestId: created.id };
}

type RestoreInventoryTx = {
  branchInventory: typeof prisma.branchInventory;
  serialNumberHistory: typeof prisma.serialNumberHistory;
};

/**
 * Restore original sold serials to STK/DEF at the **branch sold** (`sale.branchId`).
 * Never lands inventory on alternateBranchId. Writes SerialNumberHistory rows.
 */
async function restoreOriginalSerialsAtBranchSold(
  tx: RestoreInventoryTx,
  input: {
    tenantId: string;
    userId: string;
    soldBranchId: string;
    /** Used only to locate legacy inventory rows that never relocated. */
    stockBranchId: string;
    serialNumberIds: string[];
    restoreStatusCodeId: string;
    restoreStatusCode: "STK" | "DEF";
    soldStatusCodeIds: string[];
    historyTxnType: "return" | "replacement";
    historyDetails: string;
  },
): Promise<number> {
  const now = new Date();
  const historyRows: Array<{
    tenantId: string;
    serialNumberId: string;
    txnType: "return" | "replacement";
    details: string;
    status: string;
    createdById: string;
    createdAt: Date;
  }> = [];

  for (const serialNumberId of input.serialNumberIds) {
    const restored = await restoreSerialToStockSource(tx, {
      tenantId: input.tenantId,
      serialNumberId,
      stockBranchId: input.stockBranchId,
      soldBranchId: input.soldBranchId,
      stkCodeId: input.restoreStatusCodeId,
      soldStatusCodeIds: input.soldStatusCodeIds,
      updatedById: input.userId,
      restoreToBranchId: input.soldBranchId,
    });

    if (restored == null) {
      const existing = await tx.branchInventory.findFirst({
        where: {
          tenantId: input.tenantId,
          serialNumberId,
        },
        select: { id: true },
      });
      if (existing) {
        await tx.branchInventory.update({
          where: { id: existing.id },
          data: {
            branchId: input.soldBranchId,
            statusCodeId: input.restoreStatusCodeId,
            updatedById: input.userId,
          },
        });
      } else {
        await tx.branchInventory.create({
          data: {
            tenantId: input.tenantId,
            branchId: input.soldBranchId,
            serialNumberId,
            statusCodeId: input.restoreStatusCodeId,
            updatedById: input.userId,
          },
        });
      }
    }

    historyRows.push({
      tenantId: input.tenantId,
      serialNumberId,
      txnType: input.historyTxnType,
      details: input.historyDetails,
      status: input.restoreStatusCode,
      createdById: input.userId,
      createdAt: now,
    });
  }

  if (historyRows.length > 0) {
    await tx.serialNumberHistory.createMany({ data: historyRows });
  }

  return historyRows.length;
}

async function restoreReturnInventory(input: {
  tenantId: string;
  userId: string;
  returnRequestId: string;
  stockStatusCode: "STK" | "DEF";
  sale: {
    id: string;
    transactionNo: string;
    branchId: string;
    alternateBranchId: string | null;
    details: { serialNumberId: string | null }[];
  };
}) {
  const statusCode = input.stockStatusCode === "DEF" ? "DEF" : "STK";
  const statusCodeId = await reasonStatusService.requireCodeId(
    input.tenantId,
    "inventory_system",
    statusCode,
  );
  const sldCodeId = await reasonStatusService.requireCodeId(
    input.tenantId,
    "inventory_system",
    "SLD",
  );
  const rsvCodeId = await reasonStatusService.requireCodeId(
    input.tenantId,
    "inventory_system",
    "RSV",
  );
  const ofsCodeId = await reasonStatusService.requireCodeId(
    input.tenantId,
    "inventory_system",
    "OFS",
  );

  const soldBranchId = input.sale.branchId;
  const stockBranchId = input.sale.alternateBranchId ?? input.sale.branchId;
  const serialIds = [
    ...new Set(
      input.sale.details
        .map((d) => d.serialNumberId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  if (serialIds.length === 0) {
    return {
      error:
        "Cannot restore stock — this sale has no linked serial numbers. Check the sale details or contact support.",
    } as const;
  }

  await prisma.$transaction(async (tx) => {
    await restoreOriginalSerialsAtBranchSold(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      soldBranchId,
      stockBranchId,
      serialNumberIds: serialIds,
      restoreStatusCodeId: statusCodeId,
      restoreStatusCode: statusCode,
      soldStatusCodeIds: [sldCodeId, rsvCodeId, ofsCodeId],
      historyTxnType: "return",
      historyDetails: `Return ${input.sale.transactionNo} → ${statusCode} at branch sold (request ${input.returnRequestId})`,
    });
    await tx.branchReturnRequest.update({
      where: { id: input.returnRequestId },
      data: { status: "completed", completedAt: new Date() },
    });
    await tx.branchSalesTransaction.update({
      where: { id: input.sale.id },
      data: { atrStatus: "closed" },
    });
  });

  return { success: true as const, restoredSerialCount: serialIds.length, statusCode };
}

export async function evaluateReturnAction(returnRequestId: string, notes?: string) {
  const session = await requireAnyPermission([
    RETURNS_EVALUATE,
    SALES_RETURN_EVALUATE,
  ]);
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
  revalidatePath("/returns");
  return { success: true as const };
}

export async function approveReturnAction(returnRequestId: string) {
  const session = await requireAnyPermission([
    RETURNS_APPROVE,
    SALES_RETURN_APPROVE,
    "orders.approve",
  ]);
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
  revalidatePath("/returns");
  return { success: true as const };
}

export async function rejectReturnAction(returnRequestId: string, notes?: string) {
  const session = await requireAnyPermission([
    RETURNS_EVALUATE,
    RETURNS_APPROVE,
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

  const allowed = [
    ...salesReturnRejectPermissions(row.status),
    ...returnsRejectPermissions(row.status),
  ];
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
  revalidatePath("/returns");
  return { success: true as const };
}

export async function completeReturnRestoreAction(returnRequestId: string) {
  const session = await requireAnyPermission([
    RETURNS_COMPLETE,
    SALES_RETURN_COMPLETE,
    "logistics.manage",
    SALES_CREATE,
  ]);
  const row = await prisma.branchReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: session.user.tenantId },
    select: {
      id: true,
      status: true,
      actionType: true,
      stockStatusCode: true,
      sale: {
        select: {
          id: true,
          transactionNo: true,
          branchId: true,
          alternateBranchId: true,
          details: { select: { serialNumberId: true } },
        },
      },
    },
  });
  if (!row || row.status !== "approved") {
    return { error: "Return must be TL-approved before inventory restore" };
  }
  // Replacement path finishes via Same/New Invoice — not plain restore.
  if (row.actionType === "replacement") {
    return {
      error:
        "This request is a Replacement — complete it with Same Invoice or New Invoice from Returns",
    };
  }

  const stockStatusCode =
    row.stockStatusCode === "DEF" ? ("DEF" as const) : ("STK" as const);

  const restored = await restoreReturnInventory({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    returnRequestId,
    stockStatusCode,
    sale: row.sale,
  });
  if ("error" in restored) return restored;

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "return.completed",
    entityType: "BranchReturnRequest",
    entityId: returnRequestId,
    metadata: {
      transactionNo: row.sale.transactionNo,
      restoredSerialCount: restored.restoredSerialCount,
      stockStatusCode: restored.statusCode,
    },
  });

  revalidatePath("/sales");
  revalidatePath("/returns");
  revalidatePath("/inventory");
  return { success: true as const };
}

async function nextReplacementNo(
  tenantId: string,
  tx: Pick<typeof prisma, "salesReplacement">,
): Promise<string> {
  const count = await tx.salesReplacement.count({ where: { tenantId } });
  return `REPL-${String(count + 1).padStart(6, "0")}`;
}

const replacementSameInvoiceSchema = z.object({
  returnRequestId: z.string().min(1),
  modelId: z.string().min(1),
  replacementSerialNumberId: z.string().min(1),
});

const replacementNewInvoiceSchema = z.object({
  returnRequestId: z.string().min(1),
  transactionNo: z.string().trim().min(1),
  transactionDate: z.string().min(1),
  modelId: z.string().min(1),
  replacementSerialNumberId: z.string().min(1),
});

async function completeReplacementCore(input: {
  session: {
    user: { id: string; tenantId: string };
  };
  returnRequestId: string;
  modelId: string;
  replacementSerialNumberId: string;
  invoiceNo: string | null;
  invoiceDate: Date | null;
  mode: "same_invoice" | "new_invoice";
}) {
  const tenantId = input.session.user.tenantId;
  const userId = input.session.user.id;

  const row = await prisma.branchReturnRequest.findFirst({
    where: {
      id: input.returnRequestId,
      tenantId,
    },
    select: {
      id: true,
      status: true,
      actionType: true,
      stockStatusCode: true,
      sale: {
        select: {
          id: true,
          transactionNo: true,
          transactionDate: true,
          branchId: true,
          alternateBranchId: true,
          paymentTypeId: true,
          saleTypeId: true,
          customerDeliveryMethodId: true,
          customerName: true,
          contactNo: true,
          siTrans: true,
          infoSlipVsoRrReleased: true,
          rrReceiveDeliver: true,
          proof: true,
          amount: true,
          modelPrice: true,
          branch: { select: { dealerId: true } },
          details: {
            select: {
              id: true,
              serialNumberId: true,
              modelId: true,
              packageTypeId: true,
              brandId: true,
              promoTypeId: true,
              modelPrice: true,
              saleAmount: true,
              amount: true,
              deliveryNo: true,
              deliveryDate: true,
              statusCodeId: true,
            },
          },
        },
      },
    },
  });

  if (!row || row.status !== "approved") {
    return { error: "Replacement must be TL-approved before completing" as const };
  }
  if ((row.actionType ?? "return") !== "replacement") {
    return {
      error: "This request is a Return — use Restore stock instead" as const,
    };
  }

  const soldBranchId = row.sale.branchId;
  const stockBranchId = row.sale.alternateBranchId ?? row.sale.branchId;
  const stockStatusCode =
    row.stockStatusCode === "DEF" ? ("DEF" as const) : ("STK" as const);

  const stkCodeId = await reasonStatusService.requireCodeId(
    tenantId,
    "inventory_system",
    "STK",
  );
  const sldCodeId = await reasonStatusService.requireCodeId(
    tenantId,
    "inventory_system",
    "SLD",
  );
  const rsvCodeId = await reasonStatusService.requireCodeId(
    tenantId,
    "inventory_system",
    "RSV",
  );
  const ofsCodeId = await reasonStatusService.requireCodeId(
    tenantId,
    "inventory_system",
    "OFS",
  );
  const restoreCodeId = await reasonStatusService.requireCodeId(
    tenantId,
    "inventory_system",
    stockStatusCode,
  );

  const replacementInv = await prisma.branchInventory.findFirst({
    where: {
      tenantId,
      branchId: soldBranchId,
      statusCodeId: stkCodeId,
      serialNumberId: input.replacementSerialNumberId,
      serialNumber: { modelId: input.modelId },
    },
    select: {
      id: true,
      serialNumberId: true,
      serialNumber: {
        select: {
          id: true,
          serialNo: true,
          modelId: true,
          model: { select: { id: true, brandId: true, skuCode: true, name: true } },
        },
      },
    },
  });
  if (!replacementInv) {
    return {
      error:
        "Replacement serial must be active STK stock for the selected model at the sold branch" as const,
    };
  }

  const targetDetail =
    row.sale.details.find((d) => d.serialNumberId) ?? row.sale.details[0] ?? null;
  const originalSerialId = targetDetail?.serialNumberId ?? null;
  const originalPriceRaw =
    targetDetail?.modelPrice ??
    targetDetail?.saleAmount ??
    targetDetail?.amount ??
    row.sale.amount;
  const originalPrice =
    originalPriceRaw != null ? Number(originalPriceRaw.toString()) : 0;

  const originalSerialIds = [
    ...new Set(
      row.sale.details
        .map((d) => d.serialNumberId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (originalSerialIds.length === 0) {
    return {
      error:
        "Cannot complete replacement — this sale has no linked serial numbers" as const,
    };
  }

  const priceAsOf =
    input.mode === "new_invoice"
      ? (input.invoiceDate ?? undefined)
      : (row.sale.transactionDate ?? undefined);
  const resolvedPrice = await resolveModelPriceForSales(
    tenantId,
    input.modelId,
    targetDetail?.packageTypeId ?? undefined,
    priceAsOf,
  );
  const replacementModelPrice = resolvedPrice?.amount ?? originalPrice;

  if (input.mode === "new_invoice") {
    const newTrnNo = input.invoiceNo?.trim();
    if (!newTrnNo || !input.invoiceDate) {
      return { error: "New invoice requires transaction number and date" as const };
    }
    const taken = await prisma.branchSalesTransaction.findFirst({
      where: {
        tenantId,
        branchId: soldBranchId,
        transactionNo: newTrnNo,
      },
      select: { id: true },
    });
    if (taken) {
      return {
        error:
          "Transaction number already used on this branch. Enter a different number." as const,
      };
    }
  }

  let newSaleId: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      // 1) Restore original SN(s) → STK/DEF at branch sold + history.
      await restoreOriginalSerialsAtBranchSold(tx, {
        tenantId,
        userId,
        soldBranchId,
        stockBranchId,
        serialNumberIds: originalSerialIds,
        restoreStatusCodeId: restoreCodeId,
        restoreStatusCode: stockStatusCode,
        soldStatusCodeIds: [sldCodeId, rsvCodeId, ofsCodeId],
        historyTxnType: "replacement",
        historyDetails: `Replacement ${row.sale.transactionNo} → ${stockStatusCode} at branch sold (request ${input.returnRequestId})`,
      });

      const replacementInvoiceNo =
        input.mode === "new_invoice"
          ? (input.invoiceNo?.trim() ?? row.sale.transactionNo)
          : row.sale.transactionNo;
      const replacementInvoiceDate =
        input.mode === "new_invoice"
          ? (input.invoiceDate ?? new Date())
          : (row.sale.transactionDate ?? new Date());

      if (input.mode === "same_invoice") {
        if (!targetDetail) {
          throw new Error("Sale has no detail line to update for same-invoice replacement");
        }
        await tx.branchSalesTransactionDetail.update({
          where: { id: targetDetail.id },
          data: {
            modelId: input.modelId,
            brandId:
              replacementInv.serialNumber.model.brandId ?? targetDetail.brandId,
            serialNumberId: replacementInv.serialNumberId,
            statusCodeId: sldCodeId,
            modelPrice: replacementModelPrice,
            saleAmount: replacementModelPrice,
            amount: replacementModelPrice,
          },
        });

        // Roll up header amounts from details when this was the priced line.
        const remainingDetails = row.sale.details.filter((d) => d.id !== targetDetail.id);
        const headerAmount =
          remainingDetails.reduce((sum, d) => {
            const line =
              d.saleAmount ?? d.amount ?? d.modelPrice ?? 0;
            return sum + Number(line.toString());
          }, 0) + replacementModelPrice;
        await tx.branchSalesTransaction.update({
          where: { id: row.sale.id },
          data: {
            modelPrice: replacementModelPrice,
            amount: headerAmount,
            atrStatus: "closed",
          },
        });
      } else {
        // New Invoice: create a fresh sale copying header context.
        const created = await tx.branchSalesTransaction.create({
          data: {
            tenantId,
            branchId: soldBranchId,
            alternateBranchId: stockBranchId,
            paymentTypeId: row.sale.paymentTypeId,
            saleTypeId: row.sale.saleTypeId,
            customerDeliveryMethodId: row.sale.customerDeliveryMethodId,
            transactionNo: replacementInvoiceNo,
            transactionDate: replacementInvoiceDate,
            customerName: row.sale.customerName,
            contactNo: row.sale.contactNo,
            siTrans: replacementInvoiceNo,
            infoSlipVsoRrReleased: row.sale.infoSlipVsoRrReleased,
            rrReceiveDeliver: row.sale.rrReceiveDeliver,
            proof: row.sale.proof ?? [],
            amount: replacementModelPrice,
            modelPrice: replacementModelPrice,
            atrStatus: "open",
            createdById: userId,
          },
        });
        newSaleId = created.id;

        await tx.branchSalesTransactionDetail.create({
          data: {
            salesId: created.id,
            packageTypeId: targetDetail?.packageTypeId ?? null,
            brandId:
              replacementInv.serialNumber.model.brandId ??
              targetDetail?.brandId ??
              null,
            promoTypeId: targetDetail?.promoTypeId ?? null,
            modelId: input.modelId,
            serialNumberId: replacementInv.serialNumberId,
            statusCodeId: sldCodeId,
            saleAmount: replacementModelPrice,
            modelPrice: replacementModelPrice,
            amount: replacementModelPrice,
            deliveryNo: targetDetail?.deliveryNo ?? null,
            deliveryDate: targetDetail?.deliveryDate ?? null,
          },
        });

        await tx.branchSalesTransaction.update({
          where: { id: row.sale.id },
          data: { atrStatus: "closed" },
        });
      }

      // 2) Consume replacement SN: STK → SLD at sold branch.
      await markSerialSoldFromStockSource(tx, {
        tenantId,
        serialNumberId: replacementInv.serialNumberId,
        stockBranchId: soldBranchId,
        soldBranchId,
        stkCodeId,
        targetStatusCodeId: sldCodeId,
        updatedById: userId,
      });

      await tx.serialNumberHistory.create({
        data: {
          tenantId,
          serialNumberId: replacementInv.serialNumberId,
          txnType: "replacement",
          details:
            input.mode === "same_invoice"
              ? `Replacement sold on same invoice ${row.sale.transactionNo}`
              : `Replacement sold on new invoice ${replacementInvoiceNo}`,
          status: "SLD",
          createdById: userId,
        },
      });

      const replacementNo = await nextReplacementNo(tenantId, tx);
      await tx.salesReplacement.create({
        data: {
          tenantId,
          saleId: row.sale.id,
          replacementNo,
          originalSerialNumberId: originalSerialId,
          originalModelPrice: originalPrice,
          originalInvoiceDate: row.sale.transactionDate,
          originalInvoiceNo: row.sale.transactionNo,
          replacementSerialNumberId: replacementInv.serialNumberId,
          replacementDealerId: row.sale.branch.dealerId ?? null,
          replacementBranchId: soldBranchId,
          replacementAmount: replacementModelPrice,
          replacementModelPrice,
          replacementInvoiceDate,
          replacementInvoiceNo,
          transactedById: userId,
          transactedAt: new Date(),
        },
      });

      await tx.branchReturnRequest.update({
        where: { id: input.returnRequestId },
        data: { status: "completed", completedAt: new Date() },
      });
    });
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to complete replacement",
    } as const;
  }

  await auditService.log({
    tenantId,
    userId,
    action: "return.replacement_completed",
    entityType: "BranchReturnRequest",
    entityId: input.returnRequestId,
    metadata: {
      mode: input.mode,
      transactionNo: row.sale.transactionNo,
      replacementSerialNumberId: replacementInv.serialNumberId,
      replacementModelPrice,
      stockStatusCode,
      newSaleId,
    },
  });

  revalidatePath("/sales");
  revalidatePath("/returns");
  revalidatePath("/inventory");
  return { success: true as const };
}

export async function listReplacementLookupsAction(branchId: string, modelId?: string) {
  const session = await requireAnyPermission([
    RETURNS_COMPLETE,
    SALES_RETURN_COMPLETE,
    "logistics.manage",
    SALES_CREATE,
  ]);

  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );

  const [models, serialRows] = await Promise.all([
    prisma.productModel.findMany({
      where: { tenantId: session.user.tenantId, status: "active" },
      select: { id: true, skuCode: true, name: true },
      orderBy: { skuCode: "asc" },
      take: 1000,
    }),
    modelId
      ? prisma.branchInventory.findMany({
          where: {
            tenantId: session.user.tenantId,
            branchId,
            statusCodeId: stkCodeId,
            serialNumber: { modelId },
          },
          include: {
            serialNumber: {
              select: {
                id: true,
                serialNo: true,
                modelId: true,
              },
            },
          },
          orderBy: { serialNumber: { serialNo: "asc" } },
          take: 500,
        })
      : Promise.resolve([]),
  ]);

  return {
    models: models.map((m) => ({
      id: m.id,
      name: m.skuCode ? `${m.skuCode} · ${m.name}` : m.name,
    })),
    serials: serialRows.map((r) => ({
      id: r.serialNumber.id,
      serialNo: r.serialNumber.serialNo,
      modelId: r.serialNumber.modelId,
    })),
  };
}

export async function completeReplacementSameInvoiceAction(input: unknown) {
  const session = await requireAnyPermission([
    RETURNS_COMPLETE,
    SALES_RETURN_COMPLETE,
    "logistics.manage",
    SALES_CREATE,
  ]);
  const parsed = replacementSameInvoiceSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid same-invoice replacement" as const };

  return completeReplacementCore({
    session,
    returnRequestId: parsed.data.returnRequestId,
    modelId: parsed.data.modelId,
    replacementSerialNumberId: parsed.data.replacementSerialNumberId,
    invoiceNo: null,
    invoiceDate: null,
    mode: "same_invoice",
  });
}

export async function completeReplacementNewInvoiceAction(input: unknown) {
  const session = await requireAnyPermission([
    RETURNS_COMPLETE,
    SALES_RETURN_COMPLETE,
    "logistics.manage",
    SALES_CREATE,
  ]);
  const parsed = replacementNewInvoiceSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid new-invoice replacement" as const };

  const invoiceDate = new Date(parsed.data.transactionDate);
  if (Number.isNaN(invoiceDate.getTime())) {
    return { error: "Invalid transaction date" as const };
  }

  return completeReplacementCore({
    session,
    returnRequestId: parsed.data.returnRequestId,
    modelId: parsed.data.modelId,
    replacementSerialNumberId: parsed.data.replacementSerialNumberId,
    invoiceNo: parsed.data.transactionNo.trim(),
    invoiceDate,
    mode: "new_invoice",
  });
}

/**
 * Accounting header edit — updates BranchSalesTransaction fields only.
 * Branch / stock-source changes are blocked when any line has a real serial.
 * Reserved toggles SLD ↔ RSV on eligible detail + inventory rows.
 */
export async function updateSaleHeaderAction(input: unknown) {
  const session = await requirePermission(SALES_UPDATE);
  const parsed = updateSaleHeaderSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid sale header update" as const };

  const data = parsed.data;
  const sale = await prisma.branchSalesTransaction.findFirst({
    where: { id: data.saleId, tenantId: session.user.tenantId },
    select: {
      id: true,
      branchId: true,
      alternateBranchId: true,
      transactionNo: true,
      details: {
        select: {
          id: true,
          serialNumberId: true,
          statusCode: { select: { id: true, code: true } },
        },
      },
    },
  });
  if (!sale) return { error: "Sale not found" as const };

  if (saleHasOfficialSoldLine(sale.details)) {
    return {
      error: "Official Sold sales cannot have their header edited" as const,
    };
  }

  try {
    await assertBranchInAor(
      session.user.tenantId,
      session.user.id,
      data.branchId,
      session.user.permissions,
    );
    await assertValidStockSource(
      session.user.tenantId,
      session.user.id,
      data.branchId,
      data.alternateBranchId,
      session.user.permissions,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Access denied" };
  }

  const hasRealSerials = sale.details.some((d) => d.serialNumberId);
  if (
    hasRealSerials &&
    (data.branchId !== sale.branchId ||
      data.alternateBranchId !== (sale.alternateBranchId ?? sale.branchId))
  ) {
    return {
      error:
        "Branch and stock source can only change when every line is still TO-FOLLOW",
    };
  }

  let transactionDate: Date | null = null;
  if (data.transactionDate) {
    const d = new Date(data.transactionDate);
    if (Number.isNaN(d.getTime())) {
      return { error: "Invalid transaction date" as const };
    }
    transactionDate = d;
  }

  if (data.transactionNo !== sale.transactionNo) {
    const taken = await prisma.branchSalesTransaction.findFirst({
      where: {
        tenantId: session.user.tenantId,
        branchId: data.branchId,
        transactionNo: data.transactionNo,
        NOT: { id: sale.id },
      },
      select: { id: true },
    });
    if (taken) {
      return {
        error:
          "Transaction number already used on this branch. Enter a different number.",
      };
    }
  }

  const [payment, saleType, delivery] = await Promise.all([
    prisma.paymentType.findFirst({
      where: {
        id: data.paymentTypeId,
        tenantId: session.user.tenantId,
        recordStatus: "active",
      },
      select: { id: true },
    }),
    prisma.saleType.findFirst({
      where: {
        id: data.saleTypeId,
        tenantId: session.user.tenantId,
        recordStatus: "active",
      },
      select: { id: true },
    }),
    prisma.customerDeliveryMethod.findFirst({
      where: {
        id: data.customerDeliveryMethodId,
        tenantId: session.user.tenantId,
        recordStatus: "active",
      },
      select: { id: true },
    }),
  ]);
  if (!payment) return { error: "Payment type not found" as const };
  if (!saleType) return { error: "Sale type not found" as const };
  if (!delivery) return { error: "Customer delivery method not found" as const };

  const proofPaths =
    data.proof === undefined
      ? undefined
      : serializeSaleProofPaths(
          Array.isArray(data.proof) ? data.proof : [data.proof],
        );

  const realSerialDetails = sale.details.filter((d) => d.serialNumberId);
  const currentlyReserved =
    realSerialDetails.length > 0 &&
    realSerialDetails.every((d) => d.statusCode?.code === "RSV");
  const nextReserved = data.reserved;
  const reservedChanging =
    typeof nextReserved === "boolean" &&
    nextReserved !== currentlyReserved &&
    realSerialDetails.length > 0;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.branchSalesTransaction.update({
        where: { id: sale.id },
        data: {
          branchId: data.branchId,
          alternateBranchId: data.alternateBranchId,
          paymentTypeId: data.paymentTypeId,
          saleTypeId: data.saleTypeId,
          customerDeliveryMethodId: data.customerDeliveryMethodId,
          transactionNo: data.transactionNo,
          transactionDate,
          customerName: data.customerName,
          contactNo: data.contactNo?.trim() || null,
          siTrans: data.siTrans?.trim() || data.transactionNo,
          infoSlipVsoRrReleased: data.infoSlipVsoRrReleased?.trim() || null,
          rrReceiveDeliver: data.rrReceiveDeliver?.trim() || null,
          ...(proofPaths !== undefined ? { proof: proofPaths } : {}),
        },
      });

      if (reservedChanging && typeof nextReserved === "boolean") {
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
        const fromCodeId = nextReserved ? sldCodeId : rsvCodeId;
        const toCodeId = nextReserved ? rsvCodeId : sldCodeId;
        const eligible = realSerialDetails.filter(
          (d) =>
            d.statusCode?.code === (nextReserved ? "SLD" : "RSV") ||
            d.statusCode?.id === fromCodeId,
        );

        for (const detail of eligible) {
          if (!detail.serialNumberId) continue;
          await tx.branchSalesTransactionDetail.update({
            where: { id: detail.id },
            data: { statusCodeId: toCodeId },
          });
          await tx.branchInventory.updateMany({
            where: {
              tenantId: session.user.tenantId,
              serialNumberId: detail.serialNumberId,
              statusCodeId: fromCodeId,
            },
            data: {
              statusCodeId: toCodeId,
              updatedById: session.user.id,
            },
          });
        }
      }
    });
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to update sale header",
    };
  }

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sale.header_updated",
    entityType: "BranchSalesTransaction",
    entityId: sale.id,
    metadata: {
      transactionNo: data.transactionNo,
      previousTransactionNo: sale.transactionNo,
      reserved: nextReserved ?? currentlyReserved,
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
 *
 * Also carries the line's delivery receipt: a TO-FOLLOW unit usually learns its
 * DR at the same moment it learns its serial, so both settle in one write.
 * Only TO-FOLLOW lines (null serial) may be edited.
 */
export async function updateSaleSerialAction(input: unknown) {
  const session = await requirePermission("sales.create");
  const parsed = updateSaleSerialSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid sale line update" };

  const { saleId, detailId, serialNumberId } = parsed.data;
  const nextIsToFollow = isToFollowSerial(serialNumberId);
  const nextSerialId = nextIsToFollow ? null : serialNumberId;

  const sale = await prisma.branchSalesTransaction.findFirst({
    where: { id: saleId, tenantId: session.user.tenantId },
    select: {
      id: true,
      transactionNo: true,
      branchId: true,
      alternateBranchId: true,
      customerDeliveryMethod: { select: { name: true } },
      details: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          serialNumberId: true,
          deliveryNo: true,
          deliveryDate: true,
        },
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
  const targetDetail = detailId
    ? sale.details.find((d) => d.id === detailId)
    : sale.details[0];
  if (!targetDetail) return { error: "Sale detail line not found" };

  // Line Edit is only for pending TO-FOLLOW placeholders — not real serials.
  if (targetDetail.serialNumberId) {
    return {
      error: "Only TO-FOLLOW sale lines can be edited",
    };
  }

  // A pickup sale has no delivery receipt, so ignore whatever was submitted.
  const keepsDeliveryReceipt = capturesDeliveryReceipt(
    sale.customerDeliveryMethod?.name,
  );
  const deliveryNo = keepsDeliveryReceipt ? parsed.data.deliveryNo : undefined;
  const deliveryDate = keepsDeliveryReceipt
    ? parsed.data.deliveryDate
    : undefined;

  const oldSerialId = targetDetail.serialNumberId;
  // Only treat delivery as edited when a supplied value differs from what is
  // stored — the edit dialog always sends both fields, changed or not.
  const deliveryChanged =
    (deliveryNo !== undefined && deliveryNo !== targetDetail.deliveryNo) ||
    (deliveryDate !== undefined &&
      toDateInputValue(deliveryDate) !==
        toDateInputValue(targetDetail.deliveryDate));

  // Serial unchanged: skip the inventory dance, but still persist a DR edit.
  if (oldSerialId === nextSerialId) {
    if (!deliveryChanged) return { success: true as const };

    await prisma.branchSalesTransactionDetail.update({
      where: { id: targetDetail.id },
      data: { deliveryNo, deliveryDate },
    });

    await auditService.log({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "sale.delivery_updated",
      entityType: "BranchSalesTransaction",
      entityId: sale.id,
      metadata: {
        transactionNo: sale.transactionNo,
        detailId: targetDetail.id,
        deliveryNo: deliveryNo ?? null,
        deliveryDate: toDateInputValue(deliveryDate),
      },
    });

    revalidatePath("/sales");
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
          deliveryNo,
          deliveryDate,
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
      deliveryNo: deliveryNo ?? null,
      deliveryDate: toDateInputValue(deliveryDate),
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
