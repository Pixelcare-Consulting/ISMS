import { auditService } from "@/features/audit/services/audit.service";
import {
  sapStockPlacementRepository as repo,
  type SapStockSite,
} from "@/features/inventory/repositories/sap-stock-placement.repository";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import {
  ensureSapOnHandQuery,
  fetchSapSerialLocations,
} from "@/features/sap/services/sap-onhand-stock";
import { SkipTally } from "@/features/sap/services/sap-sync-engine";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";
import { SAP_NO_CONNECTION_MESSAGE } from "@/config/platform";
import { logger } from "@/lib/shared/logger";

/**
 * SAP's on-hand serials → ISMS stock, page by page as the serial sync reads them.
 *
 * SAP records which warehouse each serial is in (OSRQ) and tells branches from stock
 * warehouses with `U_Warehouse_Type`; that is the only location SAP has — no bins. Each
 * page the serial sync writes is looked up in SAP by serial id (one call), and:
 *
 * - **On hand at a branch** → Stock units (`branch_inventories`).
 * - **On hand in a warehouse** the SAP warehouse sync created → Warehouse stock
 *   (`warehouse_inventories`), under one location per warehouse named after it.
 * - **Service centres are not placed.** They are dimension-5 cost centres in SAP, which
 *   hold no serials. Untyped warehouses are not placed either.
 *
 * The planogram's quantity is these Stock units, counted live on the planogram page — so
 * it grows as the sync runs and never goes stale; nothing here writes to the planogram.
 *
 * Rules — SAP decides *where* a unit is; ISMS keeps its own workflow state:
 *
 * - On hand, no row anywhere in that table → created (branch: STK).
 * - Already at that branch / anywhere in that warehouse → left alone (branch status kept).
 * - At another branch / another warehouse → moved (branch: set to STK).
 * - Not on hand there in SAP any more, but held by ISMS as Stock / warehouse stock →
 *   **reported, not changed**. It may be sold, in transit or pulled out in ISMS ahead of SAP.
 */

/** One serial on a serial-sync page — already written to `serial_numbers`. */
export interface PlacementSerial {
  serialNo: string;
  itemCode: string;
  modelId: string;
  /** `SerialNumberDetails.DocEntry`, which is OSRN.AbsEntry — what the location query keys on. */
  docEntry: number;
}

interface RunStats {
  created: number;
  moved: number;
  unchanged: number;
  notOnHandInSap: number;
}

interface PageFailure {
  reason: string;
  example?: string | null;
}

type PlaceableSerial = PlacementSerial & { id: string };

const count = (value: number) => value.toLocaleString();

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

async function stkStatusId(tenantId: string): Promise<string> {
  const stk = await reasonStatusRepository.findCodeId(tenantId, "inventory_system", "STK");
  if (!stk) {
    throw new Error(
      "The inventory status STK (Stock) is missing or inactive, so Stock units cannot be " +
        "created. Restore it under Settings → Reason & Status.",
    );
  }
  return stk.id;
}

/**
 * Placement for one serial-sync run: what every page needs (sites, STK, credentials),
 * loaded once, plus the run's running totals for the toast.
 */
export class StockPlacementRun {
  readonly skips = new SkipTally();
  readonly stats: RunStats = {
    created: 0,
    moved: 0,
    unchanged: 0,
    notOnHandInSap: 0,
  };
  private readonly locationIdByWarehouse = new Map<string, string>();

  constructor(
    private readonly tenantId: string,
    private readonly actorUserId: string | null,
    private readonly creds: SapServiceLayerCredentials,
    private readonly stkId: string,
    private readonly branchByCode: Map<string, SapStockSite>,
    private readonly warehouseByCode: Map<string, SapStockSite>,
    private readonly seenAt: Date,
  ) {}

  /**
   * Place one page. Never throws: a page whose stock could not be placed is reported as a
   * skip and the serials it wrote stand — the next pass places them.
   */
  async placePage(serials: PlacementSerial[]): Promise<PageFailure[]> {
    if (serials.length === 0) return [];
    try {
      await this.place(serials);
      return [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, tenantId: this.tenantId }, "stock placement failed for a page");
      return [{ reason: `Stock was not placed for some serials: ${message}` }];
    }
  }

  private async place(serials: PlacementSerial[]): Promise<void> {
    const docEntries = serials.map((serial) => serial.docEntry);
    const sapRows = await fetchSapSerialLocations(
      this.creds,
      Math.min(...docEntries) - 1,
      Math.max(...docEntries),
    );

    // Where SAP holds each of this page's serials. The range also covers serials of items
    // ISMS does not carry, so a row counts only if it is this page's serial *and* item.
    const pageItemBySerial = new Map(serials.map((serial) => [serial.serialNo, serial.itemCode]));
    const whereBySerial = new Map<string, string>();
    for (const row of sapRows) {
      if (pageItemBySerial.get(row.serialNo) !== row.itemCode) continue;
      if (whereBySerial.has(row.serialNo)) {
        this.skips.add("Serial is on hand in two warehouses in SAP", row.serialNo);
        continue;
      }
      whereBySerial.set(row.serialNo, row.warehouseCode);
    }

    const ids = await repo.findSerials(
      this.tenantId,
      serials.map((serial) => serial.serialNo),
    );
    const placeable: PlaceableSerial[] = serials.flatMap((serial) => {
      const found = ids.get(serial.serialNo);
      return found && !found.deletedAt ? [{ ...serial, id: found.id }] : [];
    });

    await this.placeBranches(placeable, whereBySerial);
    await this.placeWarehouses(placeable, whereBySerial);
  }

  /** Stock units. */
  private async placeBranches(
    serials: PlaceableSerial[],
    whereBySerial: Map<string, string>,
  ): Promise<void> {
    const units = groupBy(
      await repo.findBranchUnits(
        this.tenantId,
        serials.map((serial) => serial.id),
      ),
      (unit) => unit.serialNumberId,
    );

    const creates: { branchId: string; serialNumberId: string }[] = [];
    const moves: { id: string; branchId: string }[] = [];

    for (const serial of serials) {
      const existing = units.get(serial.id) ?? [];
      const whs = whereBySerial.get(serial.serialNo);
      const branch = whs ? this.branchByCode.get(whs) : undefined;

      if (!branch) {
        // Not on hand at any branch in SAP. A Stock unit ISMS still holds is reported only.
        this.stats.notOnHandInSap += existing.filter(
          (unit) => unit.statusCodeId === this.stkId,
        ).length;
        continue;
      }
      if (existing.some((unit) => unit.branchId === branch.id)) {
        this.stats.unchanged += 1;
      } else if (existing.length > 0) {
        moves.push({ id: existing[0].id, branchId: branch.id });
      } else {
        creates.push({ branchId: branch.id, serialNumberId: serial.id });
      }
    }

    const created = await repo.createBranchUnits(
      this.tenantId,
      creates,
      this.stkId,
      this.actorUserId,
    );
    await repo.moveBranchUnits(this.tenantId, moves, this.stkId, this.actorUserId);
    this.stats.created += created;
    this.stats.moved += moves.length;
  }

  /** Warehouse stock, under the ISMS location that stands for each SAP warehouse. */
  private async placeWarehouses(
    serials: PlaceableSerial[],
    whereBySerial: Map<string, string>,
  ): Promise<void> {
    const units = groupBy(
      await repo.findWarehouseUnits(
        this.tenantId,
        serials.map((serial) => serial.id),
      ),
      (unit) => unit.serialNumberId,
    );

    const creates: { warehouse: SapStockSite; serialId: string }[] = [];
    const moves: { warehouse: SapStockSite; unitId: string }[] = [];

    for (const serial of serials) {
      const existing = units.get(serial.id) ?? [];
      const whs = whereBySerial.get(serial.serialNo);
      const warehouse = whs ? this.warehouseByCode.get(whs) : undefined;

      if (!warehouse) {
        this.stats.notOnHandInSap += existing.length;
        continue;
      }
      // Already in this warehouse: nothing to write. Re-stamping it every pass cost a bulk
      // update per page and fed nothing.
      if (existing.some((unit) => unit.warehouseId === warehouse.id)) this.stats.unchanged += 1;
      else if (existing.length > 0) moves.push({ warehouse, unitId: existing[0].id });
      else creates.push({ warehouse, serialId: serial.id });
    }

    for (const group of groupBy(creates, (create) => create.warehouse.id).values()) {
      const locationId = await this.locationFor(group[0].warehouse);
      const created = await repo.createWarehouseUnits(
        this.tenantId,
        locationId,
        group.map((create) => create.serialId),
        this.seenAt,
      );
      this.stats.created += created;
    }
    for (const group of groupBy(moves, (move) => move.warehouse.id).values()) {
      const locationId = await this.locationFor(group[0].warehouse);
      await repo.moveWarehouseUnits(
        this.tenantId,
        group.map((move) => move.unitId),
        locationId,
        this.seenAt,
      );
      this.stats.moved += group.length;
    }
  }

  private async locationFor(warehouse: SapStockSite): Promise<string> {
    let id = this.locationIdByWarehouse.get(warehouse.id);
    if (!id) {
      id = await repo.ensureWarehouseLocation(warehouse);
      this.locationIdByWarehouse.set(warehouse.id, id);
    }
    return id;
  }

  /** The run's outcome, folded into the serial sync's result. */
  async finish(): Promise<{ notes: string[]; skipped: SapSyncResult["skipped"] }> {
    const { stats } = this;
    await auditService.log({
      tenantId: this.tenantId,
      userId: this.actorUserId ?? undefined,
      action: "inventory.sap_stock_placement",
      entityType: "BranchInventory",
      metadata: { ...stats },
    });

    const parts = [
      `${count(stats.created)} added`,
      `${count(stats.moved)} moved`,
      `${count(stats.unchanged)} unchanged`,
    ];
    if (stats.notOnHandInSap > 0) {
      parts.push(`${count(stats.notOnHandInSap)} no longer on hand in SAP (left as is)`);
    }
    return {
      notes: [`Stock from SAP for this batch: ${parts.join(" · ")}`],
      skipped: this.skips.toList(),
    };
  }
}

export const sapStockPlacementService = {
  /**
   * Prepare placement for one serial-sync run. Throws when it cannot place anything (no
   * SAP connection, the location query cannot be created, STK missing); the caller then
   * syncs serials without placing stock and says why.
   */
  async beginRun(tenantId: string, actorUserId: string | null): Promise<StockPlacementRun> {
    const creds = await sapServiceLayerService.getCredentials(tenantId);
    if (!creds) throw new Error(SAP_NO_CONNECTION_MESSAGE);
    await ensureSapOnHandQuery(creds);
    const [stkId, branches, warehouses] = await Promise.all([
      stkStatusId(tenantId),
      repo.listSapBranches(tenantId),
      repo.listSapWarehouses(tenantId),
    ]);
    return new StockPlacementRun(
      tenantId,
      actorUserId,
      creds,
      stkId,
      new Map(branches.map((branch) => [branch.code, branch])),
      new Map(warehouses.map((warehouse) => [warehouse.code, warehouse])),
      new Date(),
    );
  },
};
