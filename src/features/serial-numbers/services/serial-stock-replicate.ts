import {
  assertExclusivePlacement,
  loadCurrentPlacements,
  lockSerialNumbers,
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
 * Upsert BranchInventory STK for on-hand serials whose warehouse resolves to one branch.
 * Skips warehouse-only / multi-branch codes. Leaves non-STK placements alone.
 * Creates branch stock only when the serial has no current placement.
 */
export async function replicateOnHandSerialsToStk(
  tenantId: string,
  onHand: OnHandWarehouseSerial[],
): Promise<{ created: number; moved: number; skipped: number }> {
  let created = 0;
  let moved = 0;
  let skipped = 0;

  if (onHand.length === 0) {
    return { created, moved, skipped };
  }

  const stk = await reasonStatusRepository.findCodeId(tenantId, "inventory_system", "STK");
  if (!stk) {
    logger.warn({ tenantId }, "STK status code missing; SAP on-hand stock was not replicated");
    return { created, moved, skipped: onHand.length };
  }

  const byWarehouse = await resolveBranchesByWarehouseCode(
    tenantId,
    onHand.map((row) => row.warehouseCode),
  );

  const resolvable = onHand.filter((row) => byWarehouse.has(row.warehouseCode));
  skipped += onHand.length - resolvable.length;
  if (resolvable.length === 0) return { created, moved, skipped };

  const serialNos = resolvable.map((row) => row.serialNo);
  const serials = await prisma.serialNumber.findMany({
    where: { tenantId, deletedAt: null, serialNo: { in: serialNos } },
    select: { id: true, serialNo: true },
  });
  const serialByNo = new Map(serials.map((row) => [row.serialNo, row]));

  for (const row of resolvable) {
    const branch = byWarehouse.get(row.warehouseCode);
    const serial = serialByNo.get(row.serialNo);
    if (!branch || !serial) {
      skipped += 1;
      continue;
    }

    const outcome = await prisma.$transaction(async (tx) => {
      await lockSerialNumbers(tx, [serial.id]);
      const placements = await loadCurrentPlacements(tx, [serial.id]);
      if (placements.some((placement) => placement.table !== "branch")) {
        return "skipped" as const;
      }
      const branchRows = placements.filter((placement) => placement.table === "branch");
      if (branchRows.length === 0) {
        assertExclusivePlacement({ placements, replacingIds: [] });
        await tx.branchInventory.create({
          data: {
            tenantId,
            branchId: branch.id,
            serialNumberId: serial.id,
            statusCodeId: stk.id,
          },
        });
        return "created" as const;
      }
      if (branchRows.some((placement) => placement.statusCode !== "STK")) {
        return "skipped" as const;
      }

      const atTarget = branchRows.find((placement) => placement.branchId === branch.id);
      const extras = branchRows.filter((placement) => placement.id !== atTarget?.id);
      if (atTarget) {
        if (extras.length > 0) {
          await tx.branchInventory.deleteMany({
            where: { id: { in: extras.map((placement) => placement.id) } },
          });
        }
        return "moved" as const;
      }

      const primary = branchRows[0];
      if (!primary) return "skipped" as const;
      await tx.branchInventory.update({
        where: { id: primary.id },
        data: { branchId: branch.id, statusCodeId: stk.id },
      });
      if (branchRows.length > 1) {
        await tx.branchInventory.deleteMany({
          where: { id: { in: branchRows.slice(1).map((placement) => placement.id) } },
        });
      }
      return "moved" as const;
    });

    switch (outcome) {
      case "created":
        created += 1;
        break;
      case "moved":
        moved += 1;
        break;
      case "skipped":
        skipped += 1;
        break;
      default: {
        const unreachable: never = outcome;
        return unreachable;
      }
    }
  }

  return { created, moved, skipped };
}
