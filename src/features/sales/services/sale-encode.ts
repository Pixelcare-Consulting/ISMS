import { z } from "zod";

import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { isToFollowSerial } from "@/features/sales/constants/to-follow-serial";
import { capturesDeliveryReceipt } from "@/features/sales/utils/delivery-method";
import { resolveModelPriceForSales } from "@/features/sales/services/model-price";
import { isSaleTransactionNo } from "@/features/sales/utils/sale-transaction-no";
import {
  serializeSaleProofPaths,
} from "@/features/sales/utils/sale-proof";
import type { Prisma } from "@/lib/database/generated/prisma/client";

/**
 * Encode and edit rules shared by every sale stock source (branch Sales Transactions
 * and service center sales). Callers own the stock-source checks and inventory moves.
 */

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `<input type="date">` value → UTC-midnight Date. Anchoring to UTC keeps the
 * stored day identical to the day the user picked, whatever the server zone is.
 */
export function parseDateInputValue(value: string): Date | null {
  if (!DATE_INPUT_PATTERN.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** Inverse of parseDateInputValue, for pre-filling a date input. */
export function toDateInputValue(value: Date | null | undefined): string | null {
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

export const saleDetailSchema = z.object({
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

export type SaleDetailInput = z.infer<typeof saleDetailSchema>;

/**
 * Per-line Edit. Delivery fields are omit-to-keep / blank-to-clear, so they
 * land as `undefined` (Prisma skips the column) or `null` (Prisma clears it).
 */
export const updateSaleSerialSchema = z.object({
  saleId: z.string().min(1),
  /** When set, only this detail line is updated. */
  detailId: z.string().min(1).optional(),
  /** Real serial id, or TO-FOLLOW to clear the linked unit. */
  serialNumberId: z.string().min(1),
  deliveryNo: deliveryNoSchema.transform((value) => value || null).optional(),
  deliveryDate: deliveryDateSchema.optional(),
});

/** Header fields every sale has, whatever its stock source. */
export const saleHeaderFieldsSchema = z.object({
  transactionNo: z
    .string()
    .trim()
    .min(1)
    .refine(isSaleTransactionNo, "Invalid transaction number"),
  customerName: z.string().trim().min(1),
  contactNo: z.string().trim().max(50).optional(),
  /** Optional. Defaults to transactionNo when omitted (the UI no longer collects it). */
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
});

export type SaleHeaderFieldsInput = z.infer<typeof saleHeaderFieldsSchema>;

export type PricedSaleDetail = SaleDetailInput & { modelPrice: number };

/** Re-resolve model prices from master lists so clients cannot override them. */
export async function priceSaleDetails(
  tenantId: string,
  details: SaleDetailInput[],
  transactionDate: Date | null,
): Promise<PricedSaleDetail[]> {
  return Promise.all(
    details.map(async (detail) => {
      const resolved = await resolveModelPriceForSales(
        tenantId,
        detail.modelId,
        detail.packageTypeId,
        transactionDate ?? undefined,
      );
      return { ...detail, modelPrice: resolved?.amount ?? 0 };
    }),
  );
}

/** Real serial ids on the sale. TO-FOLLOW is a placeholder and may repeat. */
export function realSaleSerialIds(details: Array<{ serialNumberId: string }>): string[] {
  return details
    .map((detail) => detail.serialNumberId)
    .filter((id) => !isToFollowSerial(id));
}

export const DUPLICATE_SALE_SERIAL_ERROR =
  "Duplicate serials in the same transaction are not allowed";

export function hasDuplicateSaleSerials(serialIds: string[]): boolean {
  return new Set(serialIds).size !== serialIds.length;
}

export interface SaleEncodeStatusCodes {
  stkCodeId: string | null;
  /** SLD, or RSV for a reserved sale. */
  targetStatusCodeId: string | null;
  fwCodeId: string | null;
}

/** Skips lookups that the sale does not need (an all TO-FOLLOW sale moves no stock). */
export async function resolveSaleEncodeStatusCodes(
  tenantId: string,
  input: { hasRealSerials: boolean; hasToFollow: boolean; reserved: boolean },
): Promise<SaleEncodeStatusCodes> {
  const [stkCodeId, targetStatusCodeId, fwCodeRow] = await Promise.all([
    input.hasRealSerials
      ? reasonStatusService.requireCodeId(tenantId, "inventory_system", "STK")
      : Promise.resolve(null),
    input.hasRealSerials
      ? reasonStatusService.requireCodeId(
          tenantId,
          "inventory_system",
          input.reserved ? "RSV" : "SLD",
        )
      : Promise.resolve(null),
    input.hasToFollow
      ? reasonStatusRepository.findCodeId(tenantId, "inventory_system", "FW")
      : Promise.resolve(null),
  ]);
  return { stkCodeId, targetStatusCodeId, fwCodeId: fwCodeRow?.id ?? null };
}

type SaleLookupClient = Pick<
  Prisma.TransactionClient,
  "packageType" | "brand" | "promoType" | "paymentType" | "saleType" | "customerDeliveryMethod"
>;

/** Payment, sale type, and delivery method must be active lookups of this tenant. */
export async function assertSaleHeaderLookups(
  db: SaleLookupClient,
  tenantId: string,
  input: Pick<
    SaleHeaderFieldsInput,
    "paymentTypeId" | "saleTypeId" | "customerDeliveryMethodId"
  >,
): Promise<{ deliveryMethodName: string }> {
  const [payment, saleType, delivery] = await Promise.all([
    db.paymentType.findFirst({
      where: { id: input.paymentTypeId, tenantId, recordStatus: "active" },
      select: { id: true },
    }),
    db.saleType.findFirst({
      where: { id: input.saleTypeId, tenantId, recordStatus: "active" },
      select: { id: true },
    }),
    db.customerDeliveryMethod.findFirst({
      where: { id: input.customerDeliveryMethodId, tenantId, recordStatus: "active" },
      select: { name: true },
    }),
  ]);
  if (!payment) throw new Error("Payment type not found");
  if (!saleType) throw new Error("Sale type not found");
  if (!delivery) throw new Error("Customer delivery method not found");
  return { deliveryMethodName: delivery.name };
}

/** Package, brand, and promo on every line must be lookups of this tenant. */
export async function assertSaleLineLookups(
  db: SaleLookupClient,
  tenantId: string,
  details: SaleDetailInput[],
): Promise<void> {
  const packageIds = [...new Set(details.map((d) => d.packageTypeId))];
  const brandIds = [...new Set(details.map((d) => d.brandId))];
  const promoIds = [
    ...new Set(
      details.map((d) => d.promoTypeId).filter((id): id is string => Boolean(id)),
    ),
  ];

  const [pkgs, brands, promos] = await Promise.all([
    db.packageType.findMany({
      where: { id: { in: packageIds }, tenantId, recordStatus: "active" },
      select: { id: true },
    }),
    db.brand.findMany({
      where: { id: { in: brandIds }, tenantId },
      select: { id: true },
    }),
    promoIds.length
      ? db.promoType.findMany({
          where: { id: { in: promoIds }, tenantId, recordStatus: "active" },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  if (pkgs.length !== packageIds.length) throw new Error("Package type not found");
  if (brands.length !== brandIds.length) throw new Error("Brand not found");
  if (promoIds.length && promos.length !== promoIds.length) {
    throw new Error("Promo type not found");
  }
}

/**
 * Line and header lookups for a new sale. Queries run in parallel; errors are reported
 * in a fixed order (package, brand, promo, payment, sale type, delivery).
 */
export async function assertSaleLookups(
  db: SaleLookupClient,
  tenantId: string,
  header: Pick<
    SaleHeaderFieldsInput,
    "paymentTypeId" | "saleTypeId" | "customerDeliveryMethodId"
  >,
  details: SaleDetailInput[],
): Promise<{ deliveryMethodName: string }> {
  const [lines, headerResult] = await Promise.allSettled([
    assertSaleLineLookups(db, tenantId, details),
    assertSaleHeaderLookups(db, tenantId, header),
  ]);
  if (lines.status === "rejected") throw lines.reason;
  if (headerResult.status === "rejected") throw headerResult.reason;
  return headerResult.value;
}

function proofPathsFrom(proof: SaleHeaderFieldsInput["proof"]): string[] {
  if (!proof) return [];
  return serializeSaleProofPaths(Array.isArray(proof) ? proof : [proof]);
}

/** Header columns written on create. Stock-source columns are added by the caller. */
export function saleHeaderCreateData(
  input: SaleHeaderFieldsInput,
  context: {
    transactionDate: Date | null;
    details: PricedSaleDetail[];
    createdById: string;
  },
) {
  const amount = context.details.reduce((sum, d) => sum + d.saleAmount, 0);
  const modelPrice = context.details.find((d) => d.modelPrice != null)?.modelPrice;
  return {
    paymentTypeId: input.paymentTypeId,
    saleTypeId: input.saleTypeId,
    customerDeliveryMethodId: input.customerDeliveryMethodId,
    transactionNo: input.transactionNo,
    transactionDate: context.transactionDate,
    customerName: input.customerName,
    contactNo: input.contactNo || null,
    siTrans: input.siTrans || input.transactionNo,
    infoSlipVsoRrReleased: input.infoSlipVsoRrReleased || null,
    rrReceiveDeliver: input.rrReceiveDeliver || null,
    proof: proofPathsFrom(input.proof),
    amount,
    modelPrice: modelPrice ?? null,
    atrStatus: "open" as const,
    createdById: context.createdById,
  };
}

/** Header columns written on header edit. Proof is left alone when not sent. */
export function saleHeaderUpdateData(
  input: SaleHeaderFieldsInput,
  transactionDate: Date | null,
) {
  return {
    paymentTypeId: input.paymentTypeId,
    saleTypeId: input.saleTypeId,
    customerDeliveryMethodId: input.customerDeliveryMethodId,
    transactionNo: input.transactionNo,
    transactionDate,
    customerName: input.customerName,
    contactNo: input.contactNo?.trim() || null,
    siTrans: input.siTrans?.trim() || input.transactionNo,
    infoSlipVsoRrReleased: input.infoSlipVsoRrReleased?.trim() || null,
    rrReceiveDeliver: input.rrReceiveDeliver?.trim() || null,
    ...(input.proof !== undefined ? { proof: proofPathsFrom(input.proof) } : {}),
  };
}

/** Detail-line columns. Pickup sales drop the delivery receipt the client sent. */
export function saleDetailRowData(
  detail: PricedSaleDetail,
  context: {
    serialNumberId: string | null;
    statusCodeId: string | null;
    keepsDeliveryReceipt: boolean;
  },
) {
  return {
    packageTypeId: detail.packageTypeId,
    brandId: detail.brandId,
    promoTypeId: detail.promoTypeId ?? null,
    modelId: detail.modelId,
    serialNumberId: context.serialNumberId,
    statusCodeId: context.statusCodeId,
    saleAmount: detail.saleAmount,
    modelPrice: detail.modelPrice ?? null,
    amount: detail.saleAmount,
    deliveryNo: context.keepsDeliveryReceipt ? detail.deliveryNo || null : null,
    deliveryDate: context.keepsDeliveryReceipt ? (detail.deliveryDate ?? null) : null,
  };
}

export interface SaleLineReserveState {
  id: string;
  serialNumberId: string | null;
  statusCode?: { code: string } | null;
}

/** A sale reads as Reserved when every real-serial line is RSV. */
export function isSaleReserved(lines: SaleLineReserveState[]): boolean {
  const real = lines.filter((line) => line.serialNumberId);
  return real.length > 0 && real.every((line) => line.statusCode?.code === "RSV");
}

export interface ReservedToggle {
  fromCode: "SLD" | "RSV";
  toCode: "SLD" | "RSV";
  /** Real-serial lines currently at `fromCode`. */
  lines: Array<{ id: string; serialNumberId: string }>;
}

/** The SLD ↔ RSV move a header edit asks for, or null when nothing changes. */
export function resolveReservedToggle(
  lines: SaleLineReserveState[],
  nextReserved: boolean | undefined,
): ReservedToggle | null {
  if (typeof nextReserved !== "boolean") return null;
  const real = lines.filter(
    (line): line is SaleLineReserveState & { serialNumberId: string } =>
      Boolean(line.serialNumberId),
  );
  if (real.length === 0 || nextReserved === isSaleReserved(lines)) return null;
  const fromCode = nextReserved ? "SLD" : "RSV";
  return {
    fromCode,
    toCode: nextReserved ? "RSV" : "SLD",
    lines: real
      .filter((line) => line.statusCode?.code === fromCode)
      .map((line) => ({ id: line.id, serialNumberId: line.serialNumberId })),
  };
}

/**
 * Delivery receipt a line Edit will write. A pickup sale has no delivery receipt, so
 * whatever was submitted is ignored. `changed` is true only when a supplied value differs
 * from what is stored (the edit dialog always sends both fields).
 */
export function resolveLineDeliveryEdit(input: {
  deliveryMethodName: string | null | undefined;
  submitted: { deliveryNo?: string | null; deliveryDate?: Date | null };
  current: { deliveryNo: string | null; deliveryDate: Date | null };
}): { deliveryNo?: string | null; deliveryDate?: Date | null; changed: boolean } {
  const keeps = capturesDeliveryReceipt(input.deliveryMethodName);
  const deliveryNo = keeps ? input.submitted.deliveryNo : undefined;
  const deliveryDate = keeps ? input.submitted.deliveryDate : undefined;
  const changed =
    (deliveryNo !== undefined && deliveryNo !== input.current.deliveryNo) ||
    (deliveryDate !== undefined &&
      toDateInputValue(deliveryDate) !== toDateInputValue(input.current.deliveryDate));
  return { deliveryNo, deliveryDate, changed };
}
