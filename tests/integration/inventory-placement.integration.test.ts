/**
 * Real Postgres checks for one current placement per serial.
 * The suite fails when Postgres is down or the placement migration is not applied.
 * Node's test runner is used because Jest on Node 22 cannot load the Prisma client.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  markSerialSoldFromStockSource,
  restoreSerialToStockSource,
} from "@/features/inventory/services/inventory-serial-moves";
import { claimToFollowSaleLine } from "@/features/sales/services/sale-serial-link";
import { prisma } from "@/lib/database/client";

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      assert.equal(actual, expected);
    },
    toEqual(expected: unknown) {
      assert.deepEqual(actual, expected);
    },
    toBeNull() {
      assert.equal(actual, null);
    },
    toHaveLength(length: number) {
      assert.ok(Array.isArray(actual));
      assert.equal(actual.length, length);
    },
    toContain(item: unknown) {
      assert.ok(Array.isArray(actual));
      assert.ok(actual.includes(item));
    },
    rejects: {
      toThrow(pattern: RegExp) {
        return assert.rejects(actual as Promise<unknown>, pattern);
      },
    },
  };
}

const runId = `inv-${Date.now().toString(36)}`;

let tenantId = "";
let branchId = "";
let warehouseId = "";
let locationA = "";
let modelA = "";
let brandId = "";
let stkCodeId = "";
let sldCodeId = "";
let userId = "";

async function requireDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "Inventory integration tests require Postgres. DATABASE_URL is not set, so the suite cannot run.",
    );
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "connection failed";
    throw new Error(
      `Inventory integration tests require a reachable Postgres. DATABASE_URL is not reachable: ${message}`,
    );
  }
  const triggers = await prisma.$queryRaw<Array<{ tgname: string }>>`
    SELECT tgname
    FROM pg_trigger
    WHERE tgname = 'serial_placement_branch_check'
      AND NOT tgisinternal
  `;
  if (triggers.length === 0) {
    throw new Error(
      "Deferred single-placement trigger is not installed. Apply migration 20261020180000_inventory_single_placement before pnpm test:integration. This suite does not skip.",
    );
  }
}

async function seedFixture(): Promise<void> {
  const tenant = await prisma.tenant.create({
    data: { name: `Integrity ${runId}`, slug: runId },
    select: { id: true },
  });
  tenantId = tenant.id;
  const user = await prisma.user.create({
    data: {
      tenantId,
      email: `${runId}@example.test`,
      name: "Integrity",
      passwordHash: "not-a-login",
    },
    select: { id: true },
  });
  userId = user.id;
  const brand = await prisma.brand.create({
    data: { tenantId, name: `Brand ${runId}` },
    select: { id: true },
  });
  brandId = brand.id;
  const model = await prisma.productModel.create({
    data: { tenantId, brandId, skuCode: `SKU-A-${runId}`, name: "Model A" },
    select: { id: true },
  });
  modelA = model.id;
  const warehouse = await prisma.warehouse.create({
    data: { tenantId, code: `WH-${runId}`, name: "Integrity warehouse" },
    select: { id: true },
  });
  warehouseId = warehouse.id;
  const branch = await prisma.branch.create({
    data: { tenantId, sapCode: `BR-${runId}`, name: "Integrity branch", primaryWarehouseId: warehouseId },
    select: { id: true },
  });
  branchId = branch.id;
  const location = await prisma.warehouseLocation.create({
    data: { warehouseId, code: "A1", name: "A1" },
    select: { id: true },
  });
  locationA = location.id;
  const status = await prisma.reasonStatus.create({
    data: {
      tenantId,
      category: "inventory_system",
      name: "Inventory",
      code: "inventory_system",
    },
    select: { id: true },
  });
  const [stk, sld] = await Promise.all([
    prisma.reasonStatusCode.create({
      data: { tenantId, reasonStatusId: status.id, name: "Stock", code: "STK", isSystem: true },
      select: { id: true },
    }),
    prisma.reasonStatusCode.create({
      data: { tenantId, reasonStatusId: status.id, name: "Sold", code: "SLD", isSystem: true },
      select: { id: true },
    }),
  ]);
  stkCodeId = stk.id;
  sldCodeId = sld.id;
}

describe("inventory placement on Postgres", { concurrency: 1, timeout: 30_000 }, () => {
  before(async () => {
    await requireDatabase();
    await seedFixture();
  });

  after(async () => {
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });
  it("allows only one to-follow assignment to take stock", async () => {
    const sale = await prisma.branchSalesTransaction.create({
      data: { tenantId, branchId, transactionNo: `${runId}-TF`, amount: 1 },
      select: { id: true },
    });
    const detail = await prisma.branchSalesTransactionDetail.create({
      data: { salesId: sale.id, modelId: modelA, brandId, serialNumberId: null },
      select: { id: true },
    });
    const serials = await Promise.all(
      ["A", "B"].map((suffix) =>
        prisma.serialNumber.create({
          data: { tenantId, serialNo: `${runId}-TF-${suffix}`, modelId: modelA },
          select: { id: true },
        }),
      ),
    );
    await prisma.branchInventory.createMany({
      data: serials.map((serial) => ({
        tenantId,
        branchId,
        serialNumberId: serial.id,
        statusCodeId: stkCodeId,
      })),
    });

    const assign = (serialNumberId: string) =>
      prisma.$transaction(async (tx) => {
        await claimToFollowSaleLine(tx, {
          detailId: detail.id,
          saleId: sale.id,
          serialNumberId,
          statusCodeId: sldCodeId,
        });
        await markSerialSoldFromStockSource(tx, {
          tenantId,
          serialNumberId,
          stockBranchId: branchId,
          soldBranchId: branchId,
          stkCodeId,
          targetStatusCodeId: sldCodeId,
          updatedById: userId,
          expectedModelId: modelA,
        });
      });

    const [first, second] = await Promise.allSettled([
      assign(serials[0]!.id),
      assign(serials[1]!.id),
    ]);
    expect([first, second].filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect([first, second].filter((row) => row.status === "rejected")).toHaveLength(1);

    const line = await prisma.branchSalesTransactionDetail.findUniqueOrThrow({
      where: { id: detail.id },
      select: { serialNumberId: true },
    });
    expect([serials[0]!.id, serials[1]!.id]).toContain(line.serialNumberId);
    const stockRows = await prisma.branchInventory.findMany({
      where: { serialNumberId: { in: serials.map((serial) => serial.id) } },
      select: { serialNumberId: true, statusCodeId: true },
    });
    expect(stockRows.filter((row) => row.statusCodeId === sldCodeId)).toHaveLength(1);
    expect(stockRows.filter((row) => row.statusCodeId === stkCodeId)).toHaveLength(1);
  });

  it("keeps the sale serial after a return and allows a later sale", async () => {
    const serialNo = `${runId}-RESALE`;
    const serial = await prisma.serialNumber.create({
      data: { tenantId, serialNo, modelId: modelA },
      select: { id: true },
    });
    await prisma.branchInventory.create({
      data: { tenantId, branchId, serialNumberId: serial.id, statusCodeId: stkCodeId },
    });
    const firstSale = await prisma.branchSalesTransaction.create({
      data: { tenantId, branchId, transactionNo: `${runId}-SALE-1`, amount: 1 },
      select: { id: true },
    });
    await prisma.$transaction(async (tx) => {
      await markSerialSoldFromStockSource(tx, {
        tenantId,
        serialNumberId: serial.id,
        stockBranchId: branchId,
        soldBranchId: branchId,
        stkCodeId,
        targetStatusCodeId: sldCodeId,
        updatedById: userId,
        expectedModelId: modelA,
      });
      await tx.branchSalesTransactionDetail.create({
        data: { salesId: firstSale.id, modelId: modelA, brandId, serialNumberId: serial.id, statusCodeId: sldCodeId },
      });
    });
    await prisma.$transaction(async (tx) => {
      const restored = await restoreSerialToStockSource(tx, {
        tenantId,
        serialNumberId: serial.id,
        stockBranchId: branchId,
        soldBranchId: branchId,
        stkCodeId,
        soldStatusCodeIds: [sldCodeId],
        updatedById: userId,
      });
      expect(restored).toBe(sldCodeId);
    });
    const historical = await prisma.branchSalesTransactionDetail.findFirstOrThrow({
      where: { salesId: firstSale.id },
      select: { serialNumberId: true },
    });
    expect(historical.serialNumberId).toBe(serial.id);

    const secondSale = await prisma.branchSalesTransaction.create({
      data: { tenantId, branchId, transactionNo: `${runId}-SALE-2`, amount: 1 },
      select: { id: true },
    });
    await prisma.$transaction(async (tx) => {
      await markSerialSoldFromStockSource(tx, {
        tenantId,
        serialNumberId: serial.id,
        stockBranchId: branchId,
        soldBranchId: branchId,
        stkCodeId,
        targetStatusCodeId: sldCodeId,
        updatedById: userId,
        expectedModelId: modelA,
      });
      await tx.branchSalesTransactionDetail.create({
        data: { salesId: secondSale.id, modelId: modelA, brandId, serialNumberId: serial.id, statusCodeId: sldCodeId },
      });
    });
    const details = await prisma.branchSalesTransactionDetail.findMany({
      where: { serialNumberId: serial.id },
      select: { salesId: true },
    });
    expect(details).toHaveLength(2);
    expect(await prisma.branchInventory.count({ where: { serialNumberId: serial.id } })).toBe(1);
  });

  it("commits a move that deletes one placement and writes the next", async () => {
    const serial = await prisma.serialNumber.create({
      data: { tenantId, serialNo: `${runId}-MOVE`, modelId: modelA },
      select: { id: true },
    });
    await prisma.warehouseInventory.create({
      data: { tenantId, serialNumberId: serial.id, warehouseLocationId: locationA, systemStatus: "Stock" },
    });
    await prisma.$transaction(async (tx) => {
      await tx.warehouseInventory.deleteMany({ where: { serialNumberId: serial.id } });
      await tx.branchInventory.create({
        data: { tenantId, branchId, serialNumberId: serial.id, statusCodeId: stkCodeId },
      });
    });
    expect(await prisma.warehouseInventory.count({ where: { serialNumberId: serial.id } })).toBe(0);
    expect(await prisma.branchInventory.count({ where: { serialNumberId: serial.id } })).toBe(1);
  });

  it("rejects a commit that would leave two current placements", async () => {
    const serialNo = `${runId}-TWO`;
    const serial = await prisma.serialNumber.create({
      data: { tenantId, serialNo, modelId: modelA },
      select: { id: true },
    });
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.branchInventory.create({
          data: { tenantId, branchId, serialNumberId: serial.id, statusCodeId: stkCodeId },
        });
        await tx.warehouseInventory.create({
          data: {
            tenantId,
            serialNumberId: serial.id,
            warehouseLocationId: locationA,
            systemStatus: "Stock",
          },
        });
      }),
    ).rejects.toThrow(/current placements/);
    expect(await prisma.branchInventory.count({ where: { serialNumberId: serial.id } })).toBe(0);
    expect(await prisma.warehouseInventory.count({ where: { serialNumberId: serial.id } })).toBe(0);
  });
});
