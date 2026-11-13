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
jest.mock("@/lib/aor/scope", () => ({ getUserBranchIds: jest.fn() }));
jest.mock("@/features/aors/repositories/aor.repository", () => ({
  aorRepository: { listUserIdsForBranchByRole: jest.fn() },
}));
jest.mock("@/features/notifications/services/notification.service", () => ({
  notificationService: { createNotification: jest.fn() },
}));
jest.mock("@/features/logistics/services/posting-support", () => ({
  ...jest.requireActual("@/features/logistics/services/posting-support"),
  authorizePosting: jest.fn(),
  authorizeCreateBranches: jest.fn(),
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
    findCodeId: jest.fn(
      async (_tenantId: string, category: string, code: string) => `${category}-${code}`,
    ),
  },
}));

import * as dbClient from "@/lib/database/client";
import { authorizeCreateBranches, claimInventory } from "@/features/logistics/services/posting-support";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { aorRepository } from "@/features/aors/repositories/aor.repository";
import { transferPostingService } from "@/features/logistics/services/transfer-posting.service";
import { notificationService } from "@/features/notifications/services/notification.service";
import { getUserBranchIds } from "@/lib/aor/scope";

type Mocks = Record<string, Record<string, jest.Mock>>;
const mockTx = (dbClient as unknown as { mockTx: Mocks }).mockTx;

const actor = {
  tenantId: "t1",
  userId: "u1",
  permissions: ["logistics.manage"],
  roleSlugs: ["tl"],
};

const assignedBranches = getUserBranchIds as jest.Mock;
const branchTls = aorRepository.listUserIdsForBranchByRole as jest.Mock;
const createNotification = notificationService.createNotification as jest.Mock;

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
    lines: ["s1", "s2"].map((serialNumberId) => ({
      serialNumberId,
      decision,
      priorStatusCodeId: "id-STK",
      priorStatusCode: { code: "STK" },
    })),
  };
}

function setUp(code: string, inventoryCode: string, branchId = "b1") {
  mockTx.branchTransfer.findFirst.mockResolvedValue(transfer(code));
  mockTx.branchInventory.findMany.mockResolvedValue(
    ["s1", "s2"].map((serialNumberId) => ({
      serialNumberId,
      branchId,
      statusCode: { code: inventoryCode },
    })),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.branchTransferApprovalLevel.findFirst.mockResolvedValue({ id: "level-1", approvedAt: null, approvedById: null });
  mockTx.branchTransferLine.updateMany.mockResolvedValue({ count: 1 });
  mockTx.user.findFirst.mockResolvedValue(null);
  assignedBranches.mockResolvedValue(["b1"]);
  branchTls.mockResolvedValue([]);
});

function requestTransfer() {
  const stock = (serialNumberId: string) => ({
    serialNumberId,
    statusCode: { code: "STK" },
    serialNumber: { serialNo: serialNumberId.toUpperCase(), modelId: "m1" },
    defectReports: [],
  });
  (dbClient.prisma as unknown as Mocks).branch.findMany.mockResolvedValue([
    { id: "b1", dealerId: "d1", name: "Tiongsan Harrison" },
    { id: "b2", dealerId: "d1", name: "Tiongsan Baguio" },
  ]);
  mockTx.branchInventory.findMany.mockResolvedValue([stock("s1"), stock("s2")]);
  mockTx.branchTransfer.create.mockResolvedValue({ id: "x1", transferNo: "XFR-9" });
  return transferPostingService.create(actor, {
    fromBranchId: "b1",
    toBranchId: "b2",
    modelId: "m1",
    quantity: 2,
    serialNumberIds: ["s1", "s2"],
    lineRemarks: { s1: "For display" },
  });
}

describe("who can decide a transfer", () => {
  const onlyTl = "Only the team leader assigned to the releasing branch can decide this transfer";

  it.each([
    ["a team leader on another branch", ["tl"], ["b9"]],
    ["a team leader with no AOR rows", ["tl"], null],
    ["another role assigned to the branch", ["logistics"], ["b1"]],
    ["a tenant admin", ["tenant_admin"], null],
  ])("refuses %s", async (_label, roleSlugs, branches) => {
    setUp("pending_tl", "RSV");
    assignedBranches.mockResolvedValue(branches);
    const someone = { ...actor, roleSlugs };

    await expect(transferPostingService.approve(someone, "x1")).rejects.toThrow(onlyTl);
    await expect(transferPostingService.reject(someone, "x1")).rejects.toThrow(onlyTl);
    expect(mockTx.inventoryApproval.updateMany).not.toHaveBeenCalled();
  });

  it("lets a super admin step in", async () => {
    setUp("pending_tl", "RSV");
    assignedBranches.mockResolvedValue(null);

    await transferPostingService.approve({ ...actor, roleSlugs: ["super_admin"] }, "x1");

    expect(mockTx.inventoryApproval.updateMany).toHaveBeenCalled();
  });
});

describe("approval request", () => {
  it("goes to each team leader assigned to the releasing branch", async () => {
    branchTls.mockResolvedValue(["tl-1", "tl-2"]);

    await requestTransfer();

    expect(branchTls).toHaveBeenCalledWith("t1", "b1", "tl");
    expect(createNotification.mock.calls.map(([call]) => call.data)).toEqual([
      expect.objectContaining({
        audience: "USER",
        userId: "tl-1",
        type: "transfer",
        title: "XFR-9 · Tiongsan Harrison",
        body: "Transfer to Tiongsan Baguio needs your approval.",
        href: "/logistics/transfers/x1",
      }),
      expect.objectContaining({ audience: "USER", userId: "tl-2" }),
    ]);
  });

  it("does not notify the team leader who raised it", async () => {
    branchTls.mockResolvedValue(["u1", "tl-2"]);

    await requestTransfer();

    expect(createNotification.mock.calls.map(([call]) => call.data.userId)).toEqual(["tl-2"]);
  });

  it("keeps the saved transfer when the notification fails", async () => {
    branchTls.mockResolvedValue(["tl-1"]);
    createNotification.mockRejectedValueOnce(new Error("bell down"));

    await expect(requestTransfer()).resolves.toMatchObject({ transferNo: "XFR-9" });
  });
});

describe("transfer approvals", () => {
  it("opens the TL step per unit on create, with each unit's remarks", async () => {
    await requestTransfer();

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

  it("opens the receiving step on approval", async () => {
    setUp("pending_tl", "RSV");

    await transferPostingService.approve(actor, "x1");

    // The TL decision writes first; the receiving rows follow.
    const receiving = mockTx.inventoryApproval.createMany.mock.calls
      .map((call) => call[0].data)
      .find((rows) => rows[0]?.step === "RECEIVING");
    expect(receiving).toEqual([
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

  it("opens the receiving step on a legacy release", async () => {
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

describe("serial status through the transfer", () => {
  const claim = claimInventory as jest.Mock;

  it("reserves the units when the request is created", async () => {
    await requestTransfer();

    expect(claim).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        serialNumberIds: ["s1", "s2"],
        fromStatusCodeId: "inventory_system-STK",
        toStatusCodeId: "inventory_system-RSV",
      }),
    );
  });

  it("creates the request when the tenant's status settings have no FTR code", async () => {
    const requireCodeId = jest.mocked(reasonStatusService.requireCodeId);
    requireCodeId.mockImplementation(async (_tenantId, category, code) => {
      if (code === "FTR") throw new Error("Status code not configured: inventory_system/FTR");
      return `${category}-${code}`;
    });

    await requestTransfer();

    expect(requireCodeId).not.toHaveBeenCalledWith(expect.anything(), "inventory_system", "FTR");
    expect(claim).toHaveBeenCalled();
  });

  it("checks both branches against the requester's area of responsibility", async () => {
    await requestTransfer();

    expect(authorizeCreateBranches).toHaveBeenCalledWith(actor, ["b1", "b2"]);
  });

  it("moves reserved units in transit to the receiving branch on approval", async () => {
    setUp("pending_tl", "RSV");

    await transferPostingService.approve(actor, "x1");

    expect(claim).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        branchId: "b1",
        serialNumberIds: ["s1", "s2"],
        fromStatusCodeId: "inventory_system-RSV",
        toStatusCodeId: "inventory_system-DIT",
        toBranchId: "b2",
      }),
    );
    expect(mockTx.serialNumberHistory.createMany.mock.calls[0]?.[0].data).toEqual([
      expect.objectContaining({
        serialNumberId: "s1",
        status: "DIT",
        details: "Approved and in transit on XFR-1",
      }),
      expect.objectContaining({ serialNumberId: "s2", status: "DIT" }),
    ]);
  });

  it("moves legacy For transfer units in transit to the receiving branch on release", async () => {
    setUp("for_transfer", "FTR");

    await transferPostingService.release(actor, "x1");

    expect(claim).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        branchId: "b1",
        serialNumberIds: ["s1", "s2"],
        fromStatusCodeId: "inventory_system-FTR",
        toStatusCodeId: "inventory_system-DIT",
        toBranchId: "b2",
      }),
    );
  });

  it("accepts an in-transit unit into stock at the receiving branch", async () => {
    setUp("in_transit", "DIT", "b2");

    await transferPostingService.receive(actor, "x1", ["s1"]);

    expect(claim).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        branchId: "b2",
        serialNumberIds: ["s1"],
        fromStatusCodeId: "inventory_system-DIT",
        toStatusCodeId: "inventory_system-STK",
        toBranchId: "b2",
      }),
    );
  });

  it("returns a rejected in-transit unit to stock at the releasing branch", async () => {
    setUp("in_transit", "DIT", "b2");

    await transferPostingService.rejectSerial(actor, "x1", "s2", "Wrong model");

    expect(claim).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        branchId: "b2",
        serialNumberIds: ["s2"],
        fromStatusCodeId: "inventory_system-DIT",
        toStatusCodeId: "inventory_system-STK",
        toBranchId: "b1",
      }),
    );
  });

  it("still accepts a unit released before the row moved to the receiving branch", async () => {
    setUp("in_transit", "DIT", "b1");

    await transferPostingService.receive(actor, "x1", ["s1"]);

    expect(claim).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({ branchId: "b1", fromStatusCodeId: "inventory_system-DIT", toBranchId: "b2" }),
    );
  });
});
