import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";

import type { ModeOfPaymentKindValue } from "@/features/lookups/constants/mode-of-payment-kind";
import type { OrderSapDocType } from "@/features/orders/constants/order-sap-doc-type";
import { prisma } from "@/lib/database/client";

export const MAX_SALES_ORDER_NUMBER_ATTEMPTS = 20;
/** Inclusive 00000 through exclusive 100000. */
const SUFFIX_SPAN = 100_000;

export const SALES_ORDER_NUMBER_EXHAUSTED_MESSAGE =
  "Could not assign a unique sales order number. Please try again.";

type OrderNumberLookup = {
  branchOrder: {
    findFirst(args: {
      where: { tenantId: string; orderNumber: { in: string[] } };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
};

/** Every prefix an order number can carry. A suffix is unique across all of them. */
const ORDER_NUMBER_PREFIXES: readonly OrderSapDocType[] = ["ITR", "SO"];

/** `2026-10-`: the part of the number after the prefix that changes by month. */
function currentYearMonth(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-`;
}

/**
 * The prefix an order number gets from its mode of payment: ITR for consignment, SO for
 * outright. An unclassified mode of payment (or none) keeps the original SO; final
 * approval refuses such an order until its mode of payment has a kind anyway.
 */
export function orderNumberPrefix(kind: ModeOfPaymentKindValue | null | undefined): OrderSapDocType {
  return kind === "CONSIGNMENT" ? "ITR" : "SO";
}

/**
 * The kind of the mode of payment a new order will use: its own override, else the
 * branch dealer's. Mirrors `resolveOrderModeOfPayment`, read straight from the database.
 */
export async function orderModeOfPaymentKind(
  db: Prisma.TransactionClient,
  input: { tenantId: string; branchId: string; modeOfPaymentId?: string | null },
): Promise<ModeOfPaymentKindValue | null> {
  if (input.modeOfPaymentId) {
    const override = await db.modeOfPayment.findFirst({
      where: { id: input.modeOfPaymentId, tenantId: input.tenantId },
      select: { kind: true },
    });
    return override?.kind ?? null;
  }
  const branch = await db.branch.findFirst({
    where: { id: input.branchId, tenantId: input.tenantId },
    select: { dealer: { select: { modeOfPayment: { select: { kind: true } } } } },
  });
  return branch?.dealer?.modeOfPayment?.kind ?? null;
}

function randomSuffix(): string {
  return String(randomInt(0, SUFFIX_SPAN)).padStart(5, "0");
}

function asOrderNumberLookup(db: Prisma.TransactionClient | typeof prisma): OrderNumberLookup {
  return db as unknown as OrderNumberLookup;
}

/** Taken under any prefix: ITR#2026-10-00001 and SO#2026-10-00001 must never both exist. */
async function salesOrderSuffixTaken(
  db: OrderNumberLookup,
  tenantId: string,
  yearMonthSuffix: string,
): Promise<boolean> {
  const existing = await db.branchOrder.findFirst({
    where: {
      tenantId,
      orderNumber: { in: ORDER_NUMBER_PREFIXES.map((prefix) => `${prefix}#${yearMonthSuffix}`) },
    },
    select: { id: true },
  });
  return existing != null;
}

/**
 * True when Prisma rejected the insert because this tenant already has the order number.
 * Other unique conflicts are left for the caller.
 */
export function isSalesOrderNumberConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  if ((error as { code: string }).code !== "P2002") return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (target == null) return true;
  const fields = Array.isArray(target) ? target.map(String).join(",") : String(target);
  return /order_?number/i.test(fields);
}

/**
 * Random order number for this month: ITR#{YYYY}-{MM}-##### for consignment, SO#… for
 * outright (see `orderNumberPrefix`). A suffix already stored for the tenant under either
 * prefix is skipped. Existing orders keep the number they have.
 * Uses the same local clock as before (server local year and month).
 */
export async function nextSalesOrderNumber(
  tenantId: string,
  options?: { db?: Prisma.TransactionClient; now?: Date; prefix?: OrderSapDocType },
): Promise<string> {
  const yearMonth = currentYearMonth(options?.now);
  const prefix = options?.prefix ?? "SO";
  const db = options?.db;

  if (db) {
    // One lock per month for both prefixes, since they share the suffix space. The key
    // keeps its old "SO#…" shape so a server still on the previous build takes the same lock.
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order-number|${tenantId}|SO#${yearMonth}`})::bigint)`;
  }

  const lookup = asOrderNumberLookup(db ?? prisma);

  for (let attempt = 0; attempt < MAX_SALES_ORDER_NUMBER_ATTEMPTS; attempt += 1) {
    const yearMonthSuffix = `${yearMonth}${randomSuffix()}`;
    const taken = await salesOrderSuffixTaken(lookup, tenantId, yearMonthSuffix);
    if (!taken) return `${prefix}#${yearMonthSuffix}`;
  }

  throw new Error(SALES_ORDER_NUMBER_EXHAUSTED_MESSAGE);
}
