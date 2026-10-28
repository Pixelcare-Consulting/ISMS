import {
  loadCurrentPlacements,
  lockSerialNumbers,
  type CurrentPlacement,
} from "@/features/inventory/services/serial-placement";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/shared/logger";

export interface OnHandWarehouseSerial {
  serialNo: string;
  warehouseCode: string;
}

interface ResolvedBranch {
  id: string;
  sapCode: string;
}

/**
 * Live Branch.sapCode + Warehouse.code values that may keep a serial on hand.
 */
export async function loadMasterWarehouseAllowList(tenantId: string): Promise<Set<string>> {
  const [branches, warehouses] = await Promise.all([
    prisma.branch.findMany({
      where: { tenantId, deletedAt: null },
      select: { sapCode: true },
    }),
    prisma.warehouse.findMany({
      where: { tenantId, deletedAt: null },
      select: { code: true },
    }),
  ]);
  const allow = new Set<string>();
  for (const row of branches) {
    const code = row.sapCode.trim();
    if (code) allow.add(code);
  }
  for (const row of warehouses) {
    const code = row.code.trim();
    if (code) allow.add(code);
  }
  return allow;
}

/**
 * Split on-hand rows by whether their warehouse code is in Branch/Warehouse master.
 * `unknown` keeps the code so the sync can name the warehouses to sync first.
 */
export function partitionOnHandByMaster(
  onHand: OnHandWarehouseSerial[],
  allowList: ReadonlySet<string>,
): { known: OnHandWarehouseSerial[]; unknown: OnHandWarehouseSerial[] } {
  const known: OnHandWarehouseSerial[] = [];
  const unknown: OnHandWarehouseSerial[] = [];
  const seen = new Set<string>();
  for (const row of onHand) {
    const serialNo = row.serialNo.trim();
    if (!serialNo || seen.has(serialNo)) continue;
    seen.add(serialNo);
    const warehouseCode = row.warehouseCode.trim();
    if (warehouseCode && allowList.has(warehouseCode)) {
      known.push({ serialNo, warehouseCode });
    } else {
      unknown.push({ serialNo, warehouseCode });
    }
  }
  return { known, unknown };
}

/**
 * Resolve warehouse codes to a unique branch (Branch.sapCode wins; else warehouse
 * with exactly one live primary branch). Multi-branch / unlinked warehouses are skipped.
 */
async function resolveBranchesByWarehouseCode(
  tenantId: string,
  warehouseCodes: string[],
): Promise<Map<string, ResolvedBranch>> {
  const codes = [...new Set(warehouseCodes.map((code) => code.trim()).filter(Boolean))];
  const found = new Map<string, ResolvedBranch>();
  if (codes.length === 0) return found;

  const branches = await prisma.branch.findMany({
    where: { tenantId, deletedAt: null, sapCode: { in: codes } },
    select: { id: true, sapCode: true },
  });
  for (const row of branches) {
    found.set(row.sapCode, { id: row.id, sapCode: row.sapCode });
  }

  const remaining = codes.filter((code) => !found.has(code));
  if (remaining.length === 0) return found;

  const warehouses = await prisma.warehouse.findMany({
    where: { tenantId, deletedAt: null, code: { in: remaining } },
    select: {
      code: true,
      primaryBranches: {
        where: { deletedAt: null },
        select: { id: true, sapCode: true },
      },
    },
  });
  for (const warehouse of warehouses) {
    if (warehouse.primaryBranches.length !== 1) continue;
    const branch = warehouse.primaryBranches[0];
    if (!branch) continue;
    found.set(warehouse.code, { id: branch.id, sapCode: branch.sapCode });
  }
  return found;
}

/**
 * Serials replicated per transaction. Bounds how long one transaction holds row locks
 * while keeping a sync page to a handful of round trips instead of one per serial.
 */
const REPLICATE_CHUNK_SIZE = 500;

type ReplicateOutcome = "created" | "moved" | "skipped";

interface ReplicateTarget {
  serialNumberId: string;
  branchId: string;
}

/**
 * What one serial needs, given its current placements:
 * - none: create STK at the branch
 * - only STK branch rows: keep (or move) one at the branch and delete the rest
 * - anything else (warehouse, service center, non-STK branch row): leave alone
 */
function planReplicate(
  target: ReplicateTarget,
  placements: readonly CurrentPlacement[],
): { outcome: ReplicateOutcome; moveId?: string; deleteIds: string[] } {
  if (placements.length === 0) return { outcome: "created", deleteIds: [] };
  if (placements.some((placement) => placement.table !== "branch")) {
    return { outcome: "skipped", deleteIds: [] };
  }
  if (placements.some((placement) => placement.statusCode !== "STK")) {
    return { outcome: "skipped", deleteIds: [] };
  }

  const atTarget = placements.find((placement) => placement.branchId === target.branchId);
  const keep = atTarget ?? placements[0];
  if (!keep) return { outcome: "skipped", deleteIds: [] };
  return {
    outcome: "moved",
    moveId: atTarget ? undefined : keep.id,
    deleteIds: placements.filter((placement) => placement.id !== keep.id).map((p) => p.id),
  };
}

/** Lock, read and write one chunk of serials in a single transaction. */
async function replicateChunk(
  tenantId: string,
  stkId: string,
  targets: readonly ReplicateTarget[],
): Promise<Record<ReplicateOutcome, number>> {
  const counts: Record<ReplicateOutcome, number> = { created: 0, moved: 0, skipped: 0 };
  const ids = targets.map((target) => target.serialNumberId);

  await prisma.$transaction(async (tx) => {
    await lockSerialNumbers(tx, ids);
    const placementsBySerial = new Map<string, CurrentPlacement[]>();
    for (const placement of await loadCurrentPlacements(tx, ids)) {
      const rows = placementsBySerial.get(placement.serialNumberId) ?? [];
      rows.push(placement);
      placementsBySerial.set(placement.serialNumberId, rows);
    }

    const creates: ReplicateTarget[] = [];
    const movesByBranch = new Map<string, string[]>();
    const deleteIds: string[] = [];
    for (const target of targets) {
      const plan = planReplicate(target, placementsBySerial.get(target.serialNumberId) ?? []);
      counts[plan.outcome] += 1;
      if (plan.outcome === "created") creates.push(target);
      if (plan.moveId) {
        const moves = movesByBranch.get(target.branchId) ?? [];
        moves.push(plan.moveId);
        movesByBranch.set(target.branchId, moves);
      }
      deleteIds.push(...plan.deleteIds);
    }

    // Deletes first: a serial's extra rows go before its kept row is repointed.
    if (deleteIds.length > 0) {
      await tx.branchInventory.deleteMany({ where: { id: { in: deleteIds } } });
    }
    for (const [branchId, moveIds] of movesByBranch) {
      await tx.branchInventory.updateMany({
        where: { id: { in: moveIds } },
        data: { branchId, statusCodeId: stkId },
      });
    }
    if (creates.length > 0) {
      await tx.branchInventory.createMany({
        data: creates.map((target) => ({
          tenantId,
          branchId: target.branchId,
          serialNumberId: target.serialNumberId,
          statusCodeId: stkId,
        })),
      });
    }
  });

  return counts;
}

/**
 * Upsert BranchInventory STK for on-hand serials whose warehouse resolves to one branch.
 * Skips warehouse-only / multi-branch codes. Leaves non-STK placements alone.
 * Creates branch stock only when the serial has no current placement.
 *
 * Runs in bulk: a sync page costs a few transactions, not one per serial.
 */
export async function replicateOnHandSerialsToStk(
  tenantId: string,
  onHand: OnHandWarehouseSerial[],
): Promise<{ created: number; moved: number; skipped: number }> {
  const totals = { created: 0, moved: 0, skipped: 0 };
  if (onHand.length === 0) return totals;

  const stk = await reasonStatusRepository.findCodeId(tenantId, "inventory_system", "STK");
  if (!stk) {
    logger.warn({ tenantId }, "STK status code missing; SAP on-hand stock was not replicated");
    return { ...totals, skipped: onHand.length };
  }

  const byWarehouse = await resolveBranchesByWarehouseCode(
    tenantId,
    onHand.map((row) => row.warehouseCode),
  );

  const resolvable = onHand.filter((row) => byWarehouse.has(row.warehouseCode));
  totals.skipped += onHand.length - resolvable.length;
  if (resolvable.length === 0) return totals;

  const serials = await prisma.serialNumber.findMany({
    where: { tenantId, deletedAt: null, serialNo: { in: resolvable.map((row) => row.serialNo) } },
    select: { id: true, serialNo: true },
  });
  const serialIdByNo = new Map(serials.map((row) => [row.serialNo, row.id]));

  // One target per serial: a serial listed twice would otherwise be planned twice
  // against the same placements.
  const targets = new Map<string, ReplicateTarget>();
  for (const row of resolvable) {
    const branch = byWarehouse.get(row.warehouseCode);
    const serialNumberId = serialIdByNo.get(row.serialNo);
    if (!branch || !serialNumberId || targets.has(serialNumberId)) {
      totals.skipped += 1;
      continue;
    }
    targets.set(serialNumberId, { serialNumberId, branchId: branch.id });
  }

  const all = [...targets.values()];
  for (let i = 0; i < all.length; i += REPLICATE_CHUNK_SIZE) {
    const counts = await replicateChunk(tenantId, stk.id, all.slice(i, i + REPLICATE_CHUNK_SIZE));
    totals.created += counts.created;
    totals.moved += counts.moved;
    totals.skipped += counts.skipped;
  }
  return totals;
}
