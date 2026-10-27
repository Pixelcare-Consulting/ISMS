import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/client";

export const MAX_SALES_ORDER_NUMBER_ATTEMPTS = 20;
/** Inclusive 00000 through exclusive 100000. */
const SUFFIX_SPAN = 100_000;

export const SALES_ORDER_NUMBER_EXHAUSTED_MESSAGE =
  "Could not assign a unique sales order number. Please try again.";

type OrderNumberLookup = {
  branchOrder: {
    findFirst(args: {
      where: { tenantId: string; orderNumber: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
};

function currentYearMonth(d = new Date()): { prefix: string } {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return { prefix: `SO#${year}-${month}-` };
}

function randomSuffix(): string {
  return String(randomInt(0, SUFFIX_SPAN)).padStart(5, "0");
}

function asOrderNumberLookup(db: Prisma.TransactionClient | typeof prisma): OrderNumberLookup {
  return db as OrderNumberLookup;
}

async function salesOrderNumberTaken(
  db: OrderNumberLookup,
  tenantId: string,
  orderNumber: string,
): Promise<boolean> {
  const existing = await db.branchOrder.findFirst({
    where: { tenantId, orderNumber },
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
 * Random sales order number for this month: SO#{YYYY}-{MM}-#####.
 * A suffix already stored for the tenant is skipped. Existing orders stay as they are.
 * Uses the same local clock as before (server local year and month).
 */
export async function nextSalesOrderNumber(
  tenantId: string,
  options?: { db?: Prisma.TransactionClient; now?: Date },
): Promise<string> {
  const { prefix } = currentYearMonth(options?.now);
  const db = options?.db;

  if (db) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order-number|${tenantId}|${prefix}`})::bigint)`;
  }

  const lookup = asOrderNumberLookup(db ?? prisma);

  for (let attempt = 0; attempt < MAX_SALES_ORDER_NUMBER_ATTEMPTS; attempt += 1) {
    const orderNumber = `${prefix}${randomSuffix()}`;
    const taken = await salesOrderNumberTaken(lookup, tenantId, orderNumber);
    if (!taken) return orderNumber;
  }

  throw new Error(SALES_ORDER_NUMBER_EXHAUSTED_MESSAGE);
}
