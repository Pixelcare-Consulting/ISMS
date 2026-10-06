import { auditService } from "@/features/audit/services/audit.service";
import {
  sapBranchStockRepository,
  type SapStockBranch,
  type StockUnitCreate,
  type StockUnitMove,
} from "@/features/inventory/repositories/sap-branch-stock.repository";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import {
  assertSapOnHandQueryInstalled,
  fetchSapOnHandSerials,
  type SapOnHandSerial,
} from "@/features/sap/services/sap-branch-stock";
import { SkipTally } from "@/features/sap/services/sap-sync-engine";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { withSapSyncLock } from "@/features/sap/services/sap-sync-lock";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import { SAP_NO_CONNECTION_MESSAGE } from "@/config/platform";
import { logger } from "@/lib/shared/logger";

/**
 * SAP branch stock → ISMS, the step each master-data sync runs once its pass completes.
 *
 * - **Models sync** refreshes `branch_stock_levels`: SAP's on-hand per branch and model,
 *   shown read-only on the planogram. Nobody types a planogram quantity in any more.
 * - **Serial numbers sync** additionally places each serial SAP holds on hand at a branch
 *   into Stock units (`branch_inventories`), which is what the Stock units table, its KPI
 *   cards and its Series summary are counted from.
 *
 * Both come from one read per branch (`fetchSapOnHandSerials`), so the planogram's on-hand
 * and the Stock units count agree whenever the serial sync is what ran last.
 *
 * Placement rules — SAP decides *where* a unit is, ISMS keeps its own workflow state:
 *
 * - On hand at branch B, no Stock unit anywhere → created at B as STK.
 * - Already a Stock unit at B → left alone, status included (a DIT/RSV set in ISMS stays).
 * - A Stock unit at another branch only → moved to B and set to STK: SAP has it on hand
 *   there, so the old branch's state no longer describes it.
 * - A STK Stock unit SAP no longer holds at its branch is **reported, not changed**. It
 *   may be sold or in transit in ISMS ahead of SAP, and removing stock is a decision this
 *   step should not take on its own.
 * - The serial must already be in ISMS: the serial sync owns the registry, and this step
 *   runs at the end of it. One that is not is skipped and placed on the next run.
 */

/** Branches read from SAP at once — enough to overlap round trips, gentle on SAP. */
const BRANCH_READ_CONCURRENCY = 4;

interface BranchSnapshot {
  branch: SapStockBranch;
  serials: SapOnHandSerial[];
}

interface Snapshot {
  branches: BranchSnapshot[];
  skips: SkipTally;
  syncedAt: Date;
}

async function readSnapshot(tenantId: string): Promise<Snapshot> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) throw new Error(SAP_NO_CONNECTION_MESSAGE);
  await assertSapOnHandQueryInstalled(creds);

  const branches = await sapBranchStockRepository.listSapBranches(tenantId);
  const skips = new SkipTally();
  const read: BranchSnapshot[] = [];
  const syncedAt = new Date();

  for (let i = 0; i < branches.length; i += BRANCH_READ_CONCURRENCY) {
    const batch = branches.slice(i, i + BRANCH_READ_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((branch) => fetchSapOnHandSerials(creds, branch.sapCode)),
    );
    results.forEach((result, index) => {
      const branch = batch[index];
      if (result.status === "fulfilled") {
        read.push({ branch, serials: result.value });
      } else {
        // One unreadable branch must not cost the others; its rows are left as they were.
        skips.add(
          `Could not read this branch's stock from SAP: ${
            result.reason instanceof Error ? result.reason.message : String(result.reason)
          }`,
          branch.sapCode,
        );
      }
    });
  }

  return { branches: read, skips, syncedAt };
}

/** Count each branch's serials per model and replace its on-hand levels. */
async function writeStockLevels(
  tenantId: string,
  snapshot: Snapshot,
  modelIdBySku: Map<string, string>,
): Promise<number> {
  let units = 0;
  for (const { branch, serials } of snapshot.branches) {
    const qtyByModel = new Map<string, number>();
    for (const serial of serials) {
      const modelId = modelIdBySku.get(serial.itemCode);
      if (!modelId) continue;
      qtyByModel.set(modelId, (qtyByModel.get(modelId) ?? 0) + 1);
      units += 1;
    }
    await sapBranchStockRepository.replaceStockLevels(
      tenantId,
      branch.id,
      [...qtyByModel.entries()].map(([modelId, onHandQty]) => ({ modelId, onHandQty })),
      snapshot.syncedAt,
    );
  }
  return units;
}

export interface StockUnitPlacement {
  created: number;
  moved: number;
  unchanged: number;
  /** STK Stock units at a branch SAP no longer holds them at. Reported only. */
  notOnHandInSap: number;
  skipped: SapSyncResult["skipped"];
}

async function placeStockUnits(
  tenantId: string,
  actorUserId: string | null,
  snapshot: Snapshot,
  modelIdBySku: Map<string, string>,
): Promise<StockUnitPlacement> {
  const stk = await reasonStatusRepository.findCodeId(tenantId, "inventory_system", "STK");
  if (!stk) {
    throw new Error(
      "The inventory status STK (Stock) is missing or inactive, so Stock units cannot be " +
        "created. Restore it under Settings → Reason & Status.",
    );
  }
  const { skips } = snapshot;

  // Which branch SAP holds each serial at. A serial is one physical unit, so two branches
  // claiming it is a SAP data problem — the first keeps it and the second is reported.
  const targetBySerial = new Map<string, { branchId: string; itemCode: string }>();
  for (const { branch, serials } of snapshot.branches) {
    for (const serial of serials) {
      if (targetBySerial.has(serial.serialNo)) {
        skips.add("Serial is on hand at two branches in SAP", serial.serialNo);
        continue;
      }
      targetBySerial.set(serial.serialNo, { branchId: branch.id, itemCode: serial.itemCode });
    }
  }

  const serials = await sapBranchStockRepository.findSerials(tenantId, [
    ...targetBySerial.keys(),
  ]);
  const existing = await sapBranchStockRepository.findStockUnits(
    tenantId,
    [...serials.values()].map((serial) => serial.id),
  );
  const unitsBySerialId = new Map<string, { id: string; branchId: string }[]>();
  for (const unit of existing) {
    const list = unitsBySerialId.get(unit.serialNumberId) ?? [];
    list.push(unit);
    unitsBySerialId.set(unit.serialNumberId, list);
  }

  const creates: StockUnitCreate[] = [];
  const moves: StockUnitMove[] = [];
  let unchanged = 0;

  for (const [serialNo, target] of targetBySerial) {
    const modelId = modelIdBySku.get(target.itemCode);
    if (!modelId) {
      skips.add("Item is not in ISMS — sync Models from SAP first", target.itemCode);
      continue;
    }
    const serial = serials.get(serialNo);
    if (!serial || serial.deletedAt) {
      skips.add(
        "Serial is not in ISMS yet — it is placed once the serial sync has read it",
        serialNo,
      );
      continue;
    }
    if (serial.modelId !== modelId) {
      skips.add("Serial belongs to a different model in ISMS than in SAP", serialNo);
      continue;
    }

    const units = unitsBySerialId.get(serial.id) ?? [];
    if (units.some((unit) => unit.branchId === target.branchId)) {
      unchanged += 1;
    } else if (units.length > 0) {
      moves.push({ id: units[0].id, branchId: target.branchId });
    } else {
      creates.push({ branchId: target.branchId, serialNumberId: serial.id });
    }
  }

  const created = await sapBranchStockRepository.createStockUnits(
    tenantId,
    creates,
    stk.id,
    actorUserId,
  );
  await sapBranchStockRepository.moveStockUnits(tenantId, moves, stk.id, actorUserId);

  // Read after the writes, so a unit just moved in is not counted as missing.
  const onHandByBranch = new Map(
    snapshot.branches.map(({ branch, serials: held }) => [
      branch.id,
      new Set(held.map((serial) => serial.serialNo)),
    ]),
  );
  const onHand = await sapBranchStockRepository.listOnHandStockUnits(tenantId, [
    ...onHandByBranch.keys(),
  ]);
  const notOnHandInSap = onHand.filter(
    (unit) => !onHandByBranch.get(unit.branchId)?.has(unit.serialNumber.serialNo),
  ).length;

  return {
    created,
    moved: moves.length,
    unchanged,
    notOnHandInSap,
    skipped: skips.toList(),
  };
}

const count = (value: number) => value.toLocaleString();

/**
 * Fold a follow-on step into the sync result it ran after. A failure is reported on the
 * result rather than thrown: the master-data pass it follows did complete.
 */
async function appendStep(
  result: SapSyncResult,
  run: () => Promise<{ note: string; skipped: SapSyncResult["skipped"] }>,
  failurePrefix: string,
): Promise<SapSyncResult> {
  try {
    const step = await run();
    return {
      ...result,
      notes: [...(result.notes ?? []), step.note],
      skipped: [...result.skipped, ...step.skipped],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error }, `${failurePrefix}: ${message}`);
    return {
      ...result,
      notes: [...(result.notes ?? []), `${failurePrefix}: ${message}`],
    };
  }
}

export const sapBranchStockService = {
  /**
   * Refresh the planogram's read-only on-hand from SAP. Run by the Models sync once its
   * pass completes; returns that result with the outcome appended.
   */
  afterModelSync(tenantId: string, result: SapSyncResult): Promise<SapSyncResult> {
    if (!result.caughtUp) return Promise.resolve(result);
    return appendStep(
      result,
      () =>
        withSapSyncLock(`branch-stock:${tenantId}`, async () => {
          const snapshot = await readSnapshot(tenantId);
          const modelIdBySku = await sapBranchStockRepository.modelIdBySku(tenantId);
          const units = await writeStockLevels(tenantId, snapshot, modelIdBySku);
          return {
            note:
              `Planogram on-hand refreshed: ${count(units)} units across ` +
              `${count(snapshot.branches.length)} branches`,
            skipped: snapshot.skips.toList(),
          };
        }),
      "Planogram on-hand was not refreshed",
    );
  },

  /**
   * Place SAP's on-hand serials into Stock units and refresh the planogram's on-hand. Run
   * by the Serial numbers sync once its pass completes — the order the integration
   * requires: models, then serials, then the stock built from both.
   */
  afterSerialSync(
    tenantId: string,
    actorUserId: string | null,
    result: SapSyncResult,
  ): Promise<SapSyncResult> {
    if (!result.caughtUp) return Promise.resolve(result);
    return appendStep(
      result,
      () =>
        withSapSyncLock(`branch-stock:${tenantId}`, async () => {
          const snapshot = await readSnapshot(tenantId);
          const modelIdBySku = await sapBranchStockRepository.modelIdBySku(tenantId);
          await writeStockLevels(tenantId, snapshot, modelIdBySku);
          const placement = await placeStockUnits(tenantId, actorUserId, snapshot, modelIdBySku);

          await auditService.log({
            tenantId,
            userId: actorUserId ?? undefined,
            action: "inventory.sap_stock_placement",
            entityType: "BranchInventory",
            metadata: {
              branches: snapshot.branches.length,
              created: placement.created,
              moved: placement.moved,
              unchanged: placement.unchanged,
              notOnHandInSap: placement.notOnHandInSap,
              skipped: placement.skipped.reduce((sum, skip) => sum + skip.count, 0),
            },
          });

          const parts = [
            `${count(placement.created)} added`,
            `${count(placement.moved)} moved`,
            `${count(placement.unchanged)} unchanged`,
          ];
          if (placement.notOnHandInSap > 0) {
            parts.push(`${count(placement.notOnHandInSap)} no longer on hand in SAP (left as is)`);
          }
          return {
            note: `Stock units from SAP: ${parts.join(" · ")}`,
            skipped: placement.skipped,
          };
        }),
      "Stock units were not updated",
    );
  },

  /** On-hand per model at one branch, for the planogram. */
  stockLevelsForBranch(tenantId: string, branchId: string) {
    return sapBranchStockRepository.stockLevelsForBranch(tenantId, branchId);
  },
};
