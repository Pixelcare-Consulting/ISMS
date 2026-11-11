jest.mock("@/lib/database/client", () => {
  const tx = {
    $queryRaw: jest.fn(),
    branchPullout: { findFirst: jest.fn(), updateMany: jest.fn() },
    branchPulloutLine: { updateMany: jest.fn(), deleteMany: jest.fn() },
    branchPulloutApprovalLevel: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    branchInventory: { findMany: jest.fn(), updateMany: jest.fn() },
    serialNumberHistory: { createMany: jest.fn() },
    inventoryApproval: { createMany: jest.fn(), updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  return {
    mockTx: tx,
    prisma: {
      branchPullout: tx.branchPullout,
      branchInventory: tx.branchInventory,
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/auth/permissions", () => ({ hasPermission: jest.fn(() => true) }));
jest.mock("@/features/logistics/services/posting-support", () => ({
  ...jest.requireActual("@/features/logistics/services/posting-support"),
  authorizePosting: jest.fn(),
  assertMovable: jest.fn(),
  claimInventory: jest.fn(),
  claimHeader: jest.fn(),
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
jest.mock("@/lib/storage", () => ({
  buildPulloutAttachmentPath: jest.fn(),
  getObjectStorage: jest.fn(),
}));

import * as dbClient from "@/lib/database/client";
import { pulloutPostingService } from "@/features/logistics/services/pullout-posting.service";

type Mocks = Record<string, Record<string, jest.Mock>>;
const mockTx = (dbClient as unknown as { mockTx: Mocks }).mockTx;

const actor = { tenantId: "t1", userId: "u1", permissions: ["pullout.approve"] };

function setUp(code: string, inventoryCode: string, lines: { id: string; decision?: string }[]) {
  mockTx.branchPullout.findFirst.mockResolvedValue({
    id: "p1",
    pulloutNo: "PLT-1",
    branchId: "b1",
    warehouseId: "w1",
    statusCodeId: `id-${code}`,
    statusCode: { code },
    lines: lines.map((line) => ({
      serialNumberId: line.id,
      decision: line.decision ?? "pending",
      receivedAt: null,
      rejectedAt: null,
      serialNumber: { serialNo: line.id.toUpperCase() },
      priorStatusCodeId: "id-STK",
      priorStatusCode: { code: "STK" },
    })),
  });
  mockTx.branchInventory.findMany.mockResolvedValue(
    lines.map((line) => ({ serialNumberId: line.id, statusCode: { code: inventoryCode } })),
  );
}

function decisions() {
  return mockTx.inventoryApproval.updateMany.mock.calls.map(([call]) => ({
    step: call.where.step,
    serialNumberIds: call.where.serialNumberId.in,
    status: call.data.status,
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.branchPulloutApprovalLevel.findFirst.mockResolvedValue({ id: "level-1" });
  mockTx.branchPulloutLine.updateMany.mockResolvedValue({ count: 1 });
});

describe("pull-out approvals", () => {
  it("approves the units still pending when the Team Leader approves the pull-out", async () => {
    setUp("pending_tl", "RSV", [{ id: "s1", decision: "accepted" }, { id: "s2" }]);

    await pulloutPostingService.approve(actor, "p1");

    expect(decisions()).toEqual([
      { step: "TL_APPROVAL", serialNumberIds: ["s2"], status: "APPROVED" },
    ]);
  });

  it("approves one unit while others wait", async () => {
    setUp("pending_tl", "RSV", [{ id: "s1" }, { id: "s2" }]);

    await pulloutPostingService.approveLine(actor, "p1", "s1");

    expect(decisions()).toEqual([
      { step: "TL_APPROVAL", serialNumberIds: ["s1"], status: "APPROVED" },
    ]);
  });

  it("keeps a declined unit in the trail after its line is deleted", async () => {
    setUp("pending_tl", "RSV", [{ id: "s1" }, { id: "s2" }]);

    await pulloutPostingService.deleteLine(actor, "p1", "s1");

    expect(mockTx.branchPulloutLine.deleteMany).toHaveBeenCalled();
    expect(decisions()).toEqual([
      { step: "TL_APPROVAL", serialNumberIds: ["s1"], status: "REJECTED" },
    ]);
  });

  it("rejects every unit when the Team Leader rejects the pull-out", async () => {
    setUp("pending_tl", "RSV", [{ id: "s1" }, { id: "s2" }]);

    await pulloutPostingService.reject(actor, "p1");

    expect(decisions()).toEqual([
      { step: "TL_APPROVAL", serialNumberIds: ["s1", "s2"], status: "REJECTED" },
    ]);
  });

  it("opens the receiving step when the pull-out is sent", async () => {
    setUp("pending_logistics", "FPO", [{ id: "s1", decision: "accepted" }]);

    await pulloutPostingService.finalize(actor, "p1");

    expect(mockTx.inventoryApproval.createMany.mock.calls[0]?.[0].data).toEqual([
      expect.objectContaining({
        sourceType: "PULLOUT",
        sourceNo: "PLT-1",
        step: "RECEIVING",
        serialNumberId: "s1",
        status: "PENDING",
      }),
    ]);
  });
});
