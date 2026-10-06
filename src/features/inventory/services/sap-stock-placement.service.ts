import { auditService } from "@/features/audit/services/audit.service";
import {
  sapStockPlacementRepository as repo,
  type SapStockSite,
} from "@/features/inventory/repositories/sap-stock-placement.repository";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { sapSyncCursorRepository } from "@/features/sap/repositories/sap-sync-cursor.repository";
import {
  ensureSapOnHandQuery,
  fetchSapItemOnHand,
  fetchSapOnHandPage,
  fetchSapOnHandSerials,
  SAP_ITEM_ONHAND_QUERY,
  SAP_SERIAL_ONHAND_QUERY,
  type SapOnHandSerial,
} from "@/features/sap/services/sap-onhand-stock";
import { SkipTally } from "@/features/sap/services/sap-sync-engine";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { withSapSyncLock } from "@/features/sap/services/sap-sync-lock";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";
import { SAP_NO_CONNECTION_MESSAGE } from "@/config/platform";
import { logger } from "@/lib/shared/logger";

/**
 * SAP's on-hand serials → ISMS stock, the step the serial sync runs once its pass is done.
 *
 * SAP records which warehouse each serial is in (OSRQ) and tells branches from stock
 * warehouses with `U_Warehouse_Type`; that is the only location SAP has — no bins. So:
 *
 * - **Branches** → Stock units (`branch_inventories`), and each planogram row's quantity
 *   (`maxQty`) is set to SAP's "In Stock" (OITW.OnHand) for that branch and model.
 * - **Warehouses** (those the SAP warehouse sync created) → Warehouse stock
 *   (`warehouse_inventories`), under one location per warehouse named after it.
 * - **Service centres are not placed.** They are dimension-5 cost centres in SAP, which
 *   hold no serials — none has a warehouse or any stock.
 *
 * Rules — SAP decides *where* a unit is; ISMS keeps its own workflow state:
 *
 * - On hand, no row anywhere in that table → created (branch: STK).
 * - Already at that branch / anywhere in that warehouse → left alone (branch status kept).
 * - At another branch / another warehouse → moved (branch: set to STK).
 * - Held by ISMS but no longer on hand there in SAP → **reported, not changed**. It may be
 *   sold, in transit or pulled out in ISMS ahead of SAP.
 * - The serial must already be in ISMS — the serial sync owns the registry.
 *
 * **Resumable.** One warehouse holds ~137k serials (a minute of SAP reads alone), so the
 * pass walks locations in order and warehouses page by page, saving its place in the
 * `stock-placement` sync cursor. A run that hits its budget returns `caughtUp: false` and
 * the sync button's Continue carries on from there.
 */

const CURSOR_KEY = "stock-placement";

interface Location extends SapStockSite {
  kind: "branch" | "warehouse";
  /** Sort + resume key: branches first, then warehouses, each by SAP code. */
  key: string;
}

interface Position {
  /** Key of the location being worked on, or null once every location is done. */
  loc: string | null;
  /** Rows of that location already applied (warehouses are read page by page). */
  skip: number;
}

interface Context {
  tenantId: string;
  actorUserId: string | null;
  creds: SapServiceLayerCredentials;
  modelIdBySku: Map<string, string>;
  stkId: string;
  passMark: Date;
  skips: SkipTally;
  stats: {
    serialsRead: number;
    created: number;
    moved: number;
    unchanged: number;
    notOnHandInSap: number;
    planogramRowsUpdated: number;
  };
}

function decodePosition(raw: string | null): Position | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Position>;
    if (typeof parsed.skip !== "number") return null;
    return { loc: typeof parsed.loc === "string" ? parsed.loc : null, skip: parsed.skip };
  } catch {
    return null;
  }
}

async function listLocations(tenantId: string): Promise<Location[]> {
  const [branches, warehouses] = await Promise.all([
    repo.listSapBranches(tenantId),
    repo.listSapWarehouses(tenantId),
  ]);
  return [
    ...branches.map((site) => ({ ...site, kind: "branch" as const, key: `branch:${site.code}` })),
    ...warehouses.map((site) => ({
      ...site,
      kind: "warehouse" as const,
      key: `warehouse:${site.code}`,
    })),
  ].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Where to resume: the saved location, or the next one if it has since gone. */
function resumeIndex(locations: Location[], position: Position | null): number {
  if (!position) return 0;
  if (position.loc === null) return locations.length;
  const exact = locations.findIndex((location) => location.key === position.loc);
  if (exact >= 0) return exact;
  const after = locations.findIndex((location) => location.key > position.loc!);
  return after >= 0 ? after : locations.length;
}

/**
 * Resolve SAP rows to ISMS serials, reporting the ones that cannot be placed. Returns the
 * serial id per SAP serial number for the rows that can.
 */
async function resolveSerials(
  ctx: Context,
  serials: SapOnHandSerial[],
): Promise<Map<string, string>> {
  const found = await repo.findSerials(
    ctx.tenantId,
    serials.map((serial) => serial.serialNo),
  );
  const resolved = new Map<string, string>();
  for (const { serialNo, itemCode } of serials) {
    const modelId = ctx.modelIdBySku.get(itemCode);
    if (!modelId) {
      ctx.skips.add("Item is not in ISMS — sync Models from SAP first", itemCode);
      continue;
    }
    const serial = found.get(serialNo);
    if (!serial || serial.deletedAt) {
      ctx.skips.add(
        "Serial is not in ISMS yet — it is placed once the serial sync has read it",
        serialNo,
      );
      continue;
    }
    if (serial.modelId !== modelId) {
      ctx.skips.add("Serial belongs to a different model in ISMS than in SAP", serialNo);
      continue;
    }
    resolved.set(serialNo, serial.id);
  }
  return resolved;
}

/** SAP's In Stock per model id, from SAP's per-item-code answer. */
function byModel(
  onHandByItem: Map<string, number>,
  modelIdBySku: Map<string, string>,
): Map<string, number> {
  const qtyByModel = new Map<string, number>();
  for (const [itemCode, qty] of onHandByItem) {
    const modelId = modelIdBySku.get(itemCode);
    if (modelId) qtyByModel.set(modelId, qty);
  }
  return qtyByModel;
}

/** Set each planogram row at the branch to SAP's In Stock for its model (0 if none). */
async function applyPlanogramQty(
  ctx: { tenantId: string; creds: SapServiceLayerCredentials; modelIdBySku: Map<string, string> },
  branch: SapStockSite,
): Promise<number> {
  const { tenantId } = ctx;
  const branchId = branch.id;
  const qtyByModel = byModel(await fetchSapItemOnHand(ctx.creds, branch.code), ctx.modelIdBySku);
  const rows = await repo.listPlanogramQty(tenantId, branchId);
  const updates = rows
    .map((row) => ({ id: row.id, maxQty: qtyByModel.get(row.modelId) ?? 0, was: row.maxQty }))
    .filter((row) => row.maxQty !== row.was)
    .map(({ id, maxQty }) => ({ id, maxQty }));
  await repo.setPlanogramQty(tenantId, updates);
  return updates.length;
}

async function placeBranch(ctx: Context, branch: Location): Promise<void> {
  const serials = await fetchSapOnHandSerials(ctx.creds, branch.code);
  ctx.stats.serialsRead += serials.length;
  const planogramChanged = await applyPlanogramQty(ctx, branch);
  ctx.stats.planogramRowsUpdated += planogramChanged;

  const resolved = await resolveSerials(ctx, serials);
  const units = await repo.findBranchUnits(ctx.tenantId, [...resolved.values()]);
  const unitsBySerial = new Map<string, { id: string; branchId: string }[]>();
  for (const unit of units) {
    unitsBySerial.set(unit.serialNumberId, [...(unitsBySerial.get(unit.serialNumberId) ?? []), unit]);
  }

  const creates: { branchId: string; serialNumberId: string }[] = [];
  const moves: { id: string; branchId: string }[] = [];
  for (const serialId of resolved.values()) {
    const existing = unitsBySerial.get(serialId) ?? [];
    if (existing.some((unit) => unit.branchId === branch.id)) ctx.stats.unchanged += 1;
    else if (existing.length > 0) moves.push({ id: existing[0].id, branchId: branch.id });
    else creates.push({ branchId: branch.id, serialNumberId: serialId });
  }

  const created = await repo.createBranchUnits(ctx.tenantId, creates, ctx.stkId, ctx.actorUserId);
  ctx.stats.created += created;
  await repo.moveBranchUnits(ctx.tenantId, moves, ctx.stkId, ctx.actorUserId);
  ctx.stats.moved += moves.length;

  // A branch is read whole, so what it no longer holds is a set difference.
  const onHand = new Set(serials.map((serial) => serial.serialNo));
  const held = await repo.listBranchOnHandSerialNos(ctx.tenantId, branch.id);
  ctx.stats.notOnHandInSap += held.filter((serialNo) => !onHand.has(serialNo)).length;
}

/** Apply one page of a warehouse. Returns the next `skip`, or null when it is done. */
async function placeWarehousePage(
  ctx: Context,
  warehouse: Location,
  skip: number,
): Promise<number | null> {
  const page = await fetchSapOnHandPage(ctx.creds, warehouse.code, skip);
  ctx.stats.serialsRead += page.serials.length;

  if (page.serials.length > 0) {
    const locationId = await repo.ensureWarehouseLocation(warehouse);
    const resolved = await resolveSerials(ctx, page.serials);
    const units = await repo.findWarehouseUnits(ctx.tenantId, [...resolved.values()]);
    const unitsBySerial = new Map<string, { id: string; warehouseId: string }[]>();
    for (const unit of units) {
      unitsBySerial.set(unit.serialNumberId, [
        ...(unitsBySerial.get(unit.serialNumberId) ?? []),
        unit,
      ]);
    }

    const creates: string[] = [];
    const moves: string[] = [];
    const stays: string[] = [];
    for (const serialId of resolved.values()) {
      const existing = unitsBySerial.get(serialId) ?? [];
      const here = existing.find((unit) => unit.warehouseId === warehouse.id);
      if (here) stays.push(here.id);
      else if (existing.length > 0) moves.push(existing[0].id);
      else creates.push(serialId);
    }

    const created = await repo.createWarehouseUnits(
      ctx.tenantId,
      locationId,
      creates,
      ctx.passMark,
    );
    ctx.stats.created += created;
    await repo.moveWarehouseUnits(ctx.tenantId, moves, locationId, ctx.passMark);
    await repo.stampWarehouseUnits(ctx.tenantId, stays, ctx.passMark);
    ctx.stats.moved += moves.length;
    ctx.stats.unchanged += stays.length;
  }

  if (page.nextSkip !== null) return page.nextSkip;

  // Read across several runs, so "no longer on hand" is every unit this pass never
  // stamped — `system_updated_at` is set to the pass's start on each unit SAP confirms.
  const unseen = await repo.countWarehouseUnitsUnseen(ctx.tenantId, warehouse.id, ctx.passMark);
  ctx.stats.notOnHandInSap += unseen;
  return null;
}

/** SAP credentials, after making sure the saved queries this caller reads exist in SAP. */
async function credentialsWithQueries(
  tenantId: string,
  queries: string[],
): Promise<SapServiceLayerCredentials> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) throw new Error(SAP_NO_CONNECTION_MESSAGE);
  for (const query of queries) await ensureSapOnHandQuery(creds, query);
  return creds;
}

const count = (value: number) => value.toLocaleString();

/** Run (or resume) the placement pass until it finishes or `deadline` passes. */
async function runPlacement(
  tenantId: string,
  actorUserId: string | null,
  deadline: number,
): Promise<SapSyncResult> {
  // Ensured before a pass begins, so a query SAP refuses to create never leaves a pass
  // half-open.
  const creds = await credentialsWithQueries(tenantId, [
    SAP_SERIAL_ONHAND_QUERY,
    SAP_ITEM_ONHAND_QUERY,
  ]);
  const stk = await reasonStatusRepository.findCodeId(tenantId, "inventory_system", "STK");
  if (!stk) {
    throw new Error(
      "The inventory status STK (Stock) is missing or inactive, so Stock units cannot be " +
        "created. Restore it under Settings → Reason & Status.",
    );
  }

  const locations = await listLocations(tenantId);
  let cursor = await sapSyncCursorRepository.get(tenantId, CURSOR_KEY);
  if (cursor.passStartedAt === null) {
    cursor = await sapSyncCursorRepository.beginPass(tenantId, CURSOR_KEY, locations.length);
  }

  const ctx: Context = {
    tenantId,
    actorUserId,
    creds,
    modelIdBySku: await repo.modelIdBySku(tenantId),
    stkId: stk.id,
    passMark: cursor.passStartedAt ?? new Date(),
    skips: new SkipTally(),
    stats: {
      serialsRead: 0,
      created: 0,
      moved: 0,
      unchanged: 0,
      notOnHandInSap: 0,
      planogramRowsUpdated: 0,
    },
  };

  const position = decodePosition(cursor.lastKey);
  let index = resumeIndex(locations, position);
  let skip = position && locations[index]?.key === position.loc ? position.skip : 0;

  while (index < locations.length) {
    const location = locations[index];
    try {
      if (location.kind === "branch") {
        await placeBranch(ctx, location);
        index += 1;
        skip = 0;
      } else {
        const next = await placeWarehousePage(ctx, location, skip);
        if (next === null) {
          index += 1;
          skip = 0;
        } else {
          skip = next;
        }
      }
    } catch (error) {
      // One unreadable location must not stall the rest; it is retried next pass.
      ctx.skips.add(
        `Could not place stock for this location: ${
          error instanceof Error ? error.message : String(error)
        }`,
        location.code,
      );
      index += 1;
      skip = 0;
    }

    await sapSyncCursorRepository.advance(
      tenantId,
      CURSOR_KEY,
      JSON.stringify({ loc: locations[index]?.key ?? null, skip } satisfies Position),
      index,
    );
    if (Date.now() >= deadline) break;
  }

  const completed = index >= locations.length;
  if (completed) await sapSyncCursorRepository.completePass(tenantId, CURSOR_KEY);

  const { stats } = ctx;
  await auditService.log({
    tenantId,
    userId: actorUserId ?? undefined,
    action: "inventory.sap_stock_placement",
    entityType: "BranchInventory",
    metadata: { locationsDone: index, locations: locations.length, completed, ...stats },
  });

  const parts = [
    `${count(stats.created)} added`,
    `${count(stats.moved)} moved`,
    `${count(stats.unchanged)} unchanged`,
  ];
  if (stats.notOnHandInSap > 0) {
    parts.push(`${count(stats.notOnHandInSap)} no longer on hand in SAP (left as is)`);
  }
  const notes = [
    completed
      ? `Branch and warehouse stock placed from SAP: ${parts.join(" · ")}`
      : `Placing stock from SAP — ${count(index)} of ${count(locations.length)} ` +
        `locations done so far: ${parts.join(" · ")}`,
  ];
  if (stats.planogramRowsUpdated > 0) {
    notes.push(`${count(stats.planogramRowsUpdated)} planogram quantities updated`);
  }

  return {
    fetched: stats.serialsRead,
    created: stats.created,
    updated: stats.moved,
    unchanged: stats.unchanged,
    removed: 0,
    skipped: ctx.skips.toList(),
    caughtUp: completed,
    passRows: index,
    totalAtSource: locations.length,
    notes,
  };
}

export const sapStockPlacementService = {
  /** Whether a placement pass is part-way through and should be continued first. */
  async inProgress(tenantId: string): Promise<boolean> {
    const cursor = await sapSyncCursorRepository.get(tenantId, CURSOR_KEY);
    return cursor.passStartedAt !== null;
  },

  /**
   * Run (or continue) the placement pass. Called by the serial sync when its own pass
   * completes, and on each Continue until placement is done.
   */
  place(tenantId: string, actorUserId: string | null, budgetMs: number): Promise<SapSyncResult> {
    return withSapSyncLock(`${CURSOR_KEY}:${tenantId}`, async () => {
      try {
        return await runPlacement(tenantId, actorUserId, Date.now() + budgetMs);
      } catch (error) {
        await sapSyncCursorRepository.recordError(
          tenantId,
          CURSOR_KEY,
          error instanceof Error ? error.message : "Unknown error",
        );
        throw error;
      }
    });
  },

  /**
   * Set every branch's planogram quantities to SAP's In Stock. Run by the Models sync once
   * its pass completes; a failure is a note on that result, never a failed sync.
   */
  async afterModelSync(tenantId: string, result: SapSyncResult): Promise<SapSyncResult> {
    if (!result.caughtUp) return result;
    try {
      const creds = await credentialsWithQueries(tenantId, [SAP_ITEM_ONHAND_QUERY]);
      const [branches, modelIdBySku] = await Promise.all([
        repo.listSapBranches(tenantId),
        repo.modelIdBySku(tenantId),
      ]);
      const ctx = { tenantId, creds, modelIdBySku };
      const skips = new SkipTally();
      let updated = 0;
      // One branch at a time, deliberately. Every read shares one Service Layer session,
      // and SAP queues concurrent requests on a session: four at once took 15s where one
      // takes 0.3s, which turned 51 branches into minutes and left the sync button hanging.
      for (const branch of branches) {
        try {
          updated += await applyPlanogramQty(ctx, branch);
        } catch (error) {
          skips.add(
            `Could not read this branch's stock from SAP: ${
              error instanceof Error ? error.message : String(error)
            }`,
            branch.code,
          );
        }
      }
      return {
        ...result,
        notes: [
          ...(result.notes ?? []),
          `Planogram quantities refreshed from SAP: ${count(updated)} changed across ` +
            `${count(branches.length)} branches`,
        ],
        skipped: [...result.skipped, ...skips.toList()],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error }, `Planogram quantities were not refreshed: ${message}`);
      return {
        ...result,
        notes: [...(result.notes ?? []), `Planogram quantities were not refreshed: ${message}`],
      };
    }
  },

  /**
   * SAP's In Stock per model id at one branch, read live — for the planogram's Add model
   * dialog, where the quantity is shown before the row exists. Null when SAP cannot be
   * read, so the UI can say so instead of showing a misleading 0.
   */
  async branchQtyByModel(tenantId: string, branchId: string): Promise<Map<string, number> | null> {
    try {
      const creds = await credentialsWithQueries(tenantId, [SAP_ITEM_ONHAND_QUERY]);
      const branches = await repo.listSapBranches(tenantId);
      const branch = branches.find((candidate) => candidate.id === branchId);
      if (!branch) return null;
      const [onHand, modelIdBySku] = await Promise.all([
        fetchSapItemOnHand(creds, branch.code),
        repo.modelIdBySku(tenantId),
      ]);
      return byModel(onHand, modelIdBySku);
    } catch (error) {
      logger.error({ err: error, branchId }, "could not read branch on-hand from SAP");
      return null;
    }
  },
};
