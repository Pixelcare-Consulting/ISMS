jest.mock("@/lib/database/client", () => {
  const tx = {
    $queryRaw: jest.fn(),
    branchTransfer: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    branchTransferLine: { updateMany: jest.fn() },
    branchTransferApprovalLevel: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    branchInventory: { findMany: jest.fn() },
    serialNumberHistory: { createMany: jest.fn() },
    inventoryApproval: { createMany: jest.fn(), updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
    user: { findFirst: jest.fn() },
  };
  return {
    mockTx: tx,
    prisma: {
      branchTransfer: tx.branchTransfer,
      branchInventory: tx.branchInventory,
      branch: { findFirst: jest.fn(), findMany: jest.fn() },
      reasonStatusCode: { findFirst: jest.fn(async () => ({ id: "id-rejected" })) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: jest.fn(() => true),
}));
jest.mock("@/features/logistics/services/posting-support", () => ({
  ...jest.requireActual("@/features/logistics/services/posting-support"),
  authorizePosting: jest.fn(),
  authorizeBranchScope: jest.fn(),
  assertMovable: jest.fn(),
  claimInventory: jest.fn(),
  claimHeader: jest.fn(),
  lockSerialsThenInventoryRows: jest.fn(),
  openDocumentIdsBySerial: jest.fn(async () => new Map()),
}));
jest.mock("@/features/inventory/services/serial-placement", () => ({
  ...jest.requireActual("@/features/inventory/services/serial-placement"),
  lockSerialNumbers: jest.fn(),
}));
jest.mock("@/features/reason-status/services/reason-status.service", () => ({
  reasonStatusService: {
    requireCodeId: jest.fn(
      async (_tenantId: string, category: string, code: string) => `${category}-${code}`,
    ),
  },
}));

import * as dbClient from "@/lib/database/client";
import { transferPostingService } from "@/features/logistics/services/transfer-posting.service";

type Mocks = Record<string, Record<string, jest.Mock>>;
const mockTx = (dbClient as unknown as { mockTx: Mocks }).mockTx;

const actor = {
  tenantId: "t1",
  userId: "u1",
  permissions: ["logistics.manage"],
  roleSlugs: ["admin"],
};

function transfer(code: string, decision = "pending") {
  return {
    id: "x1",
    transferNo: "XFR-1",
    fromBranchId: "b1",
    toBranchId: "b2",
    statusCodeId: `id-${code}`,
    statusCode: { code },
    rsNo: "RS-1",
    drNo: "DR-1",
    waybillNo: "WB-1",
    courierName: "LBC",
    scheduledAt: new Date("2026-11-06T00:00:00.000Z"),
    lines: ["s1", "s2"].map((serialNumberId) => ({
      serialNumberId,
      decision,
      priorStatusCodeId: "id-STK",
      priorStatusCode: { code: "STK" },
    })),
  };
}

function setUp(code: string, inventoryCode: string) {
  mockTx.branchTransfer.findFirst.mockResolvedValue(transfer(code));
  mockTx.branchInventory.findMany.mockResolvedValue(
    ["s1", "s2"].map((serialNumberId) => ({
      serialNumberId,
      branchId: "b1",
      statusCode: { code: inventoryCode },
    })),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.branchTransferApprovalLevel.findFirst.mockResolvedValue({ id: "level-1", approvedAt: null, approvedById: null });
  mockTx.branchTransferLine.updateMany.mockResolvedValue({ count: 1 });
  mockTx.user.findFirst.mockResolvedValue(null);
});

describe("transfer approvals", () => {
  it("opens the TL step per unit on create, with each unit's remarks", async () => {
    const stock = (serialNumberId: string) => ({
      serialNumberId,
      statusCode: { code: "STK" },
      serialNumber: { serialNo: serialNumberId.toUpperCase(), modelId: "m1" },
      defectReports: [],
    });
    (dbClient.prisma as unknown as Mocks).branch.findMany.mockResolvedValue([
      { id: "b1", dealerId: "d1" },
      { id: "b2", dealerId: "d1" },
    ]);
    mockTx.branchInventory.findMany.mockResolvedValue([stock("s1"), stock("s2")]);
    mockTx.branchTransfer.create.mockResolvedValue({ id: "x1", transferNo: "XFR-9" });

    await transferPostingService.create(actor, {
      fromBranchId: "b1",
      toBranchId: "b2",
      modelId: "m1",
      quantity: 2,
      serialNumberIds: ["s1", "s2"],
      lineRemarks: { s1: "For display" },
    });

    expect(mockTx.inventoryApproval.createMany.mock.calls[0]?.[0].data).toEqual([
      expect.objectContaining({
        sourceType: "TRANSFER",
        sourceId: "x1",
        sourceNo: "XFR-9",
        step: "TL_APPROVAL",
        serialNumberId: "s1",
        status: "PENDING",
        requestedById: "u1",
        remarks: "For display",
      }),
      expect.objectContaining({ serialNumberId: "s2", remarks: null }),
    ]);
  });

  it("closes the TL step for every unit when the Team Leader approves", async () => {
    setUp("pending_tl", "RSV");

    await transferPostingService.approve(actor, "x1");

    expect(mockTx.inventoryApproval.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        sourceType: "TRANSFER",
        sourceId: "x1",
        step: "TL_APPROVAL",
        serialNumberId: { in: ["s1", "s2"] },
      },
      data: { status: "APPROVED", decidedById: "u1" },
    });
  });

  it("closes the TL step as rejected when the Team Leader rejects", async () => {
    setUp("pending_tl", "RSV");

    await transferPostingService.reject(actor, "x1");

    expect(mockTx.inventoryApproval.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { step: "TL_APPROVAL", serialNumberId: { in: ["s1", "s2"] } },
      data: { status: "REJECTED", decidedById: "u1" },
    });
  });

  it("opens the receiving step on release", async () => {
    setUp("for_transfer", "RSV");

    await transferPostingService.release(actor, "x1");

    expect(mockTx.inventoryApproval.createMany.mock.calls[0]?.[0].data).toEqual([
      expect.objectContaining({
        sourceType: "TRANSFER",
        sourceNo: "XFR-1",
        step: "RECEIVING",
        serialNumberId: "s1",
        status: "PENDING",
        requestedById: "u1",
      }),
      expect.objectContaining({ serialNumberId: "s2", step: "RECEIVING" }),
    ]);
  });

  it("records an accepted serial at the receiving step", async () => {
    setUp("in_transit", "DIT");

    await transferPostingService.receive(actor, "x1", ["s1"]);

    expect(mockTx.inventoryApproval.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { step: "RECEIVING", serialNumberId: { in: ["s1"] } },
      data: { status: "APPROVED", decidedById: "u1" },
    });
  });

  it("records a rejected serial with the reason", async () => {
    setUp("in_transit", "DIT");

    await transferPostingService.rejectSerial(actor, "x1", "s2", "Wrong model");

    expect(mockTx.inventoryApproval.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { step: "RECEIVING", serialNumberId: { in: ["s2"] } },
      data: { status: "REJECTED", decidedById: "u1", remarks: "Wrong model" },
    });
  });

  it("writes no decision when the planner finds nothing to move", async () => {
    mockTx.branchTransfer.findFirst.mockResolvedValue(transfer("in_transit", "accepted"));
    mockTx.branchInventory.findMany.mockResolvedValue(
      ["s1", "s2"].map((serialNumberId) => ({
        serialNumberId,
        branchId: "b2",
        statusCode: { code: "STK" },
      })),
    );

    await transferPostingService.receive(actor, "x1", ["s1"]);

    expect(mockTx.inventoryApproval.updateMany).not.toHaveBeenCalled();
  });
});
