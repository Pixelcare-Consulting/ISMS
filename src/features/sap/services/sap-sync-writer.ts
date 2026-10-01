import { Prisma } from "@prisma/client";

import {
  describeWriteError,
  SAP_SYNC_CHUNK,
  SAP_SYNC_WRITE_CONCURRENCY,
} from "@/features/sap/services/sap-master-data";
import { prisma } from "@/lib/database/client";
import { mapWithConcurrency } from "@/lib/shared/concurrency";

/**
 * The two write shapes every SAP sync page needs, so five repositories don't each carry
 * their own copy of the chunking and error handling.
 *
 * Deciding *what* to write stays in the repository, where it is typed and readable. Only
 * the mechanics — batching, the per-row fallback, running independent updates
 * concurrently — live here.
 */

export interface SapWriteFailure {
  reason: string;
  example?: string | null;
}

/**
 * Insert rows in bounded batches, falling back to one-by-one for a batch that fails.
 *
 * The fallback is what keeps a single bad row from costing the other 499: `createMany` is
 * all-or-nothing, so without it one duplicate rejects its whole batch. It only runs on a
 * batch that actually failed, so the common case stays one statement per chunk.
 *
 * `createMany` should pass `skipDuplicates` where a concurrent writer (an import, an
 * overlapping slice) could have inserted the same row since the page was read.
 */
export async function createInChunks<TRow>(
  rows: TRow[],
  handlers: {
    createMany: (chunk: TRow[]) => Promise<number>;
    createOne: (row: TRow) => Promise<void>;
    describe: (row: TRow) => string | null;
  },
): Promise<{ created: number; failures: SapWriteFailure[] }> {
  const failures: SapWriteFailure[] = [];
  let created = 0;

  for (let i = 0; i < rows.length; i += SAP_SYNC_CHUNK) {
    const chunk = rows.slice(i, i + SAP_SYNC_CHUNK);
    try {
      created += await handlers.createMany(chunk);
    } catch {
      for (const row of chunk) {
        try {
          await handlers.createOne(row);
          created += 1;
        } catch (e) {
          failures.push({ reason: describeWriteError(e), example: handlers.describe(row) });
        }
      }
    }
  }

  return { created, failures };
}

/**
 * Apply per-row updates concurrently.
 *
 * Updates carry per-row values, so unlike creates they cannot be batched into one
 * statement. Run serially they turn a few thousand changed rows into a few thousand
 * sequential round trips. Safe only outside a `$transaction`, which is pinned to a single
 * connection.
 */
export async function updateEach<TRow>(
  rows: TRow[],
  handlers: {
    updateOne: (row: TRow) => Promise<void>;
    describe: (row: TRow) => string | null;
  },
): Promise<{ updated: number; failures: SapWriteFailure[] }> {
  const outcomes = await mapWithConcurrency(
    rows,
    SAP_SYNC_WRITE_CONCURRENCY,
    async (row): Promise<SapWriteFailure | null> => {
      try {
        await handlers.updateOne(row);
        return null;
      } catch (e) {
        return { reason: describeWriteError(e), example: handlers.describe(row) };
      }
    },
  );

  const failures: SapWriteFailure[] = [];
  let updated = 0;
  for (const outcome of outcomes) {
    if (outcome) failures.push(outcome);
    else updated += 1;
  }
  return { updated, failures };
}

/** The SAP-synced tables and the column each one is matched to SAP on. */
const SAP_SEEN_TARGETS = {
  product_models: "sku_code",
  serial_numbers: "serial_no",
  warehouses: "code",
  branches: "sap_code",
  service_centers: "sap_code",
} as const;

/**
 * Stamp the rows a page named as seen by the current pass (see `SapSyncReconcile`).
 *
 * Raw SQL on purpose: Prisma's `updateMany` would also bump `updated_at`, and this runs
 * over every row of every pass, so "last updated" would stop meaning anything. One
 * statement per page, through the `(tenant_id, <key>)` unique index.
 *
 * `source` is for branches, which two syncs feed — it records which one owns the row.
 */
export async function markSapSeen(
  table: keyof typeof SAP_SEEN_TARGETS,
  tenantId: string,
  keys: string[],
  passMark: Date,
  source?: string,
): Promise<void> {
  if (keys.length === 0) return;
  const unique = [...new Set(keys)];
  const keyColumn = Prisma.raw(`"${SAP_SEEN_TARGETS[table]}"`);
  const setSource = source ? Prisma.sql`, "sap_sync_source" = ${source}` : Prisma.empty;

  for (let i = 0; i < unique.length; i += SAP_SYNC_CHUNK) {
    const chunk = unique.slice(i, i + SAP_SYNC_CHUNK);
    await prisma.$executeRaw`
      UPDATE ${Prisma.raw(`"${table}"`)}
      SET "sap_synced_at" = ${passMark}${setSource}
      WHERE "tenant_id" = ${tenantId} AND ${keyColumn} IN (${Prisma.join(chunk)})
    `;
  }
}

/** Rows a completed pass never stamped — the `where` every `retireUnseen` shares. */
export function unseenSince(passMark: Date) {
  return {
    deletedAt: null,
    OR: [{ sapSyncedAt: null }, { sapSyncedAt: { lt: passMark } }],
  };
}
