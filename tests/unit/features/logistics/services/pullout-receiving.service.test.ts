jest.mock("@/lib/database/client", () => {
  const tx = {
    $queryRaw: jest.fn(),
    branchPullout: { findFirst: jest.fn(), updateMany: jest.fn() },
    branchPulloutLine: { updateMany: jest.fn() },
    branchInventory: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    warehouseInventory: { createMany: jest.fn() },
    serialNumberHistory: { createMany: jest.fn() },
    inventoryApproval: { createMany: jest.fn(), updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  return {
    mockTx: tx,
    prisma: {
      branchPullout: tx.branchPullout,
      branchInventory: tx.branchInventory,
      warehouseLocation: { findMany: jest.fn() },
      branchDefectReport: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: jest.fn((permissions: string[] | undefined, slug: string) =>
    Boolean(permissions?.includes(slug)),
  ),
}));
jest.mock("@/features/inventory/services/serial-placement", () => ({
  assertExclusivePlacement: jest.fn(),
  loadCurrentPlacements: jest.fn(),
  lockSerialNumbers: jest.fn(),
}));
jest.mock("@/features/stock-audit/services/stock-count-freeze", () => ({
  assertSerialsNotFrozenInStockCount: jest.fn(),
}));
jest.mock("@/features/reason-status/services/reason-status.service", () => ({
  reasonStatusService: {
    requireCodeId: jest.fn(async (_tenantId: string, _type: string, code: string) => `id-${code}`),
  },
}));
jest.mock("@/lib/storage", () => ({
  buildPulloutAttachmentPath: jest.fn(),
  getObjectStorage: jest.fn(),
}));

import * as dbClient from "@/lib/database/client";
import {
  assertExclusivePlacement,
  loadCurrentPlacements,
  lockSerialNumbers,
} from "@/features/inventory/services/serial-placement";
import { pulloutPostingService } from "@/features/logistics/services/pullout-posting.service";

type Mocks = Record<string, Record<string, jest.Mock>>;
const mockTx = (dbClient as unknown as { mockTx: Mocks }).mockTx;
const mockPrisma = dbClient.prisma as unknown as Mocks;

const actor = { tenantId: "t1", userId: "u1", permissions: ["logistics.manage"] };

function pullout(lines: { id: string; prior: string; receivedAt?: Date | null }[], code = "in_transit") {
  return {
    id: "p1",
    pulloutNo: "PLT-1",
    branchId: "b1",
    warehouseId: "w1",
    statusCodeId: `id-${code}`,
    statusCode: { code },
    lines: lines.map((line) => ({
      serialNumberId: line.id,
      decision: "accepted",
      receivedAt: line.receivedAt ?? null,
      rejectedAt: null,
      serialNumber: { serialNo: line.id.toUpperCase() },
      priorStatusCodeId: `id-${line.prior}`,
      priorStatusCode: { code: line.prior },
    })),
  };
}

function setUp(lines: Parameters<typeof pullout>[0], code?: string) {
  mockTx.branchPullout.findFirst.mockResolvedValue(pullout(lines, code));
  const inTransit = lines.filter((line) => !line.receivedAt);
  mockTx.branchInventory.findMany.mockResolvedValue(
    inTransit.map((line) => ({ serialNumberId: line.id, statusCode: { code: "DIT" } })),
  );
  (loadCurrentPlacements as jest.Mock).mockResolvedValue(
    inTransit.map((line) => ({
      table: "branch",
      id: `bi-${line.id}`,
      serialNumberId: line.id,
      branchId: "b1",
      statusCode: "DIT",
    })),
  );
}

const receipt = (serialNumberId: string, warehouseLocationId = "loc1") => ({
  serialNumberId,
  warehouseLocationId,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.warehouseLocation.findMany.mockImplementation(async ({ where }) =>
    [
      { id: "loc1", code: "A1", warehouse: { name: "Main" } },
      { id: "loc2", code: "B2", warehouse: { name: "Main" } },
    ].filter((location) => where.id.in.includes(location.id)),
  );
  mockPrisma.branchDefectReport.findFirst.mockResolvedValue(null);
  mockTx.branchInventory.deleteMany.mockImplementation(async ({ where }) => ({
    count: where.serialNumberId.in.length,
  }));
  mockTx.branchPulloutLine.updateMany.mockImplementation(async ({ where }) => ({
    count: where.serialNumberId.in.length,
  }));
  mockTx.branchPullout.updateMany.mockResolvedValue({ count: 1 });
  mockTx.branchInventory.updateMany.mockResolvedValue({ count: 1 });
});

describe("pulloutPostingService.complete", () => {
  it("moves each unit to warehouse stock with its original STK or DEF", async () => {
    setUp([
      { id: "s1", prior: "STK" },
      { id: "s2", prior: "DEF" },
    ]);

    await pulloutPostingService.complete(actor, "p1", {
      lines: [receipt("s1", "loc1"), receipt("s2", "loc2")],
    });

    expect(lockSerialNumbers).toHaveBeenCalledWith(mockTx, ["s1", "s2"]);
    expect(assertExclusivePlacement).toHaveBeenCalledWith(
      expect.objectContaining({ replacingIds: ["bi-s1", "bi-s2"] }),
    );
    expect(mockTx.branchInventory.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        branchId: "b1",
        serialNumberId: { in: ["s1", "s2"] },
        statusCodeId: "id-DIT",
      },
    });
    expect(mockTx.warehouseInventory.createMany.mock.calls[0]?.[0].data).toEqual([
      expect.objectContaining({ serialNumberId: "s1", warehouseLocationId: "loc1", systemStatus: "STK" }),
      expect.objectContaining({ serialNumberId: "s2", warehouseLocationId: "loc2", systemStatus: "DEF" }),
    ]);
  });

  it("writes a serial history row for every unit", async () => {
    setUp([
      { id: "s1", prior: "STK" },
      { id: "s2", prior: "DEF" },
    ]);

    await pulloutPostingService.complete(actor, "p1", {
      lines: [receipt("s1", "loc1"), receipt("s2", "loc2")],
    });

    expect(mockTx.serialNumberHistory.createMany.mock.calls[0]?.[0].data).toEqual([
      {
        tenantId: "t1",
        serialNumberId: "s1",
        txnType: "pullout",
        details: "Received on PLT-1 at Main / A1",
        status: "STK",
        createdById: "u1",
      },
      {
        tenantId: "t1",
        serialNumberId: "s2",
        txnType: "pullout",
        details: "Received on PLT-1 at Main / B2",
        status: "DEF",
        createdById: "u1",
      },
    ]);
  });

  it("records who received each unit, when, and where", async () => {
    setUp([{ id: "s1", prior: "STK" }]);

    await pulloutPostingService.complete(actor, "p1", { lines: [receipt("s1", "loc2")] });

    expect(mockTx.branchPulloutLine.updateMany).toHaveBeenCalledWith({
      where: { pulloutId: "p1", serialNumberId: { in: ["s1"] }, receivedAt: null },
      data: {
        receivedAt: expect.any(Date),
        receivedById: "u1",
        receivedLocationId: "loc2",
      },
    });
  });

  it("completes the pull-out on the last unit", async () => {
    setUp([
      { id: "s1", prior: "STK", receivedAt: new Date() },
      { id: "s2", prior: "DEF" },
    ]);

    const result = await pulloutPostingService.complete(actor, "p1", { lines: [receipt("s2")] });

    expect(result.completed).toBe(true);
    expect(mockTx.branchPullout.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", tenantId: "t1", statusCodeId: { in: ["id-in_transit"] } },
      data: { statusCodeId: "id-completed" },
    });
    expect(mockTx.auditLog.create.mock.calls[0]?.[0].data.action).toBe("pullout.completed");
  });

  it("stays in transit while other units have not arrived", async () => {
    setUp([
      { id: "s1", prior: "STK" },
      { id: "s2", prior: "DEF" },
    ]);

    const result = await pulloutPostingService.complete(actor, "p1", { lines: [receipt("s1")] });

    expect(result.completed).toBe(false);
    expect(mockTx.branchPullout.updateMany).not.toHaveBeenCalled();
    expect(mockTx.auditLog.create.mock.calls[0]?.[0].data.action).toBe("pullout.received");
  });

  it("marks the received units approved at the receiving step", async () => {
    setUp([
      { id: "s1", prior: "STK" },
      { id: "s2", prior: "DEF" },
    ]);

    await pulloutPostingService.complete(actor, "p1", { lines: [receipt("s1")] });

    expect(mockTx.inventoryApproval.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        sourceType: "PULLOUT",
        sourceId: "p1",
        step: "RECEIVING",
        serialNumberId: { in: ["s1"] },
      },
      data: { status: "APPROVED", decidedById: "u1" },
    });
  });

  it("refuses a location outside the destination warehouse", async () => {
    setUp([{ id: "s1", prior: "STK" }]);

    await expect(
      pulloutPostingService.complete(actor, "p1", { lines: [receipt("s1", "elsewhere")] }),
    ).rejects.toThrow("That location is not in the destination warehouse");
    expect(mockTx.warehouseInventory.createMany).not.toHaveBeenCalled();
  });

  it("loses cleanly to a second receiver", async () => {
    setUp([{ id: "s1", prior: "STK" }]);
    mockTx.branchInventory.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      pulloutPostingService.complete(actor, "p1", { lines: [receipt("s1")] }),
    ).rejects.toThrow("Some units are no longer in transit at the branch");
    expect(mockTx.warehouseInventory.createMany).not.toHaveBeenCalled();
    expect(mockTx.serialNumberHistory.createMany).not.toHaveBeenCalled();
  });

  it("refuses a user without the receive permission", async () => {
    setUp([{ id: "s1", prior: "STK" }]);

    await expect(
      pulloutPostingService.complete({ ...actor, permissions: [] }, "p1", { lines: [receipt("s1")] }),
    ).rejects.toThrow();
    expect(mockTx.warehouseInventory.createMany).not.toHaveBeenCalled();
  });
});

describe("pulloutPostingService.rejectLine", () => {
  const remarks = { remarks: " Lost by courier " };

  beforeEach(() => {
    mockTx.branchPulloutLine.updateMany.mockResolvedValue({ count: 1 });
  });

  it("puts the unit back at the branch with its original status", async () => {
    setUp([
      { id: "s1", prior: "DEF" },
      { id: "s2", prior: "STK" },
    ]);

    await pulloutPostingService.rejectLine(actor, "p1", "s1", remarks);

    expect(lockSerialNumbers).toHaveBeenCalledWith(mockTx, ["s1"]);
    expect(mockTx.branchInventory.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        branchId: "b1",
        serialNumberId: { in: ["s1"] },
        statusCodeId: "id-DIT",
      },
      data: { statusCodeId: "id-DEF", updatedById: "u1" },
    });
    expect(mockTx.warehouseInventory.createMany).not.toHaveBeenCalled();
  });

  it("records who rejected it, when, and why", async () => {
    setUp([
      { id: "s1", prior: "STK" },
      { id: "s2", prior: "STK" },
    ]);

    await pulloutPostingService.rejectLine(actor, "p1", "s1", remarks);

    expect(mockTx.branchPulloutLine.updateMany).toHaveBeenCalledWith({
      where: { pulloutId: "p1", serialNumberId: "s1", receivedAt: null, rejectedAt: null },
      data: { rejectedAt: expect.any(Date), rejectedById: "u1", rejectionRemarks: "Lost by courier" },
    });
    expect(mockTx.serialNumberHistory.createMany.mock.calls[0]?.[0].data).toEqual([
      {
        tenantId: "t1",
        serialNumberId: "s1",
        txnType: "pullout",
        details: "Rejected on PLT-1, back at the branch: Lost by courier",
        status: "STK",
        createdById: "u1",
      },
    ]);
  });

  it("marks the unit rejected at the receiving step, with why", async () => {
    setUp([{ id: "s1", prior: "STK" }]);

    await pulloutPostingService.rejectLine(actor, "p1", "s1", remarks);

    expect(mockTx.inventoryApproval.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { sourceType: "PULLOUT", step: "RECEIVING", serialNumberId: { in: ["s1"] } },
      data: { status: "REJECTED", decidedById: "u1", remarks: "Lost by courier" },
    });
  });

  it("leaves the pull-out open while other units are in transit", async () => {
    setUp([
      { id: "s1", prior: "STK" },
      { id: "s2", prior: "STK" },
    ]);

    await pulloutPostingService.rejectLine(actor, "p1", "s1", remarks);

    expect(mockTx.branchPullout.updateMany).not.toHaveBeenCalled();
    expect(mockTx.auditLog.create.mock.calls[0]?.[0].data.action).toBe("pullout.line_rejected");
  });

  it("completes the pull-out when the rest were received", async () => {
    setUp([
      { id: "s1", prior: "STK" },
      { id: "s2", prior: "STK", receivedAt: new Date() },
    ]);

    await pulloutPostingService.rejectLine(actor, "p1", "s1", remarks);

    expect(mockTx.branchPullout.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", tenantId: "t1", statusCodeId: { in: ["id-in_transit"] } },
      data: { statusCodeId: "id-completed" },
    });
    expect(mockTx.auditLog.create.mock.calls[0]?.[0].data.action).toBe("pullout.completed");
  });

  it("cancels the pull-out when nothing arrived", async () => {
    setUp([{ id: "s1", prior: "STK" }]);

    await pulloutPostingService.rejectLine(actor, "p1", "s1", remarks);

    expect(mockTx.branchPullout.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", tenantId: "t1", statusCodeId: { in: ["id-in_transit"] } },
      data: { statusCodeId: "id-cancelled" },
    });
    expect(mockTx.auditLog.create.mock.calls[0]?.[0].data.action).toBe("pullout.rejected");
  });

  it("refuses a user without the receive permission", async () => {
    setUp([{ id: "s1", prior: "STK" }]);

    await expect(
      pulloutPostingService.rejectLine({ ...actor, permissions: [] }, "p1", "s1", remarks),
    ).rejects.toThrow();
    expect(mockTx.branchInventory.updateMany).not.toHaveBeenCalled();
  });
});
