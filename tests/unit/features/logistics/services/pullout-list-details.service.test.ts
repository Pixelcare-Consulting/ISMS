jest.mock("@/lib/database/client", () => {
  const tx = {
    $queryRaw: jest.fn(),
    branchPullout: { findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    branchPulloutLine: { create: jest.fn(), deleteMany: jest.fn() },
    branchInventory: { findMany: jest.fn(), updateMany: jest.fn() },
    serialNumberHistory: { createMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  return {
    mockTx: tx,
    prisma: {
      branchPullout: tx.branchPullout,
      branchInventory: tx.branchInventory,
      warehouse: { findFirst: jest.fn() },
      pulloutClassification: { findMany: jest.fn() },
      unitPackingCondition: { findMany: jest.fn() },
      accessoryCompleteness: { findMany: jest.fn() },
      problemDescription: { findMany: jest.fn() },
      reasonStatusCode: { findMany: jest.fn() },
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
jest.mock("@/features/logistics/services/posting-support", () => ({
  ...jest.requireActual("@/features/logistics/services/posting-support"),
  authorizePosting: jest.fn(),
  lockSerialsThenInventoryRows: jest.fn(),
  openDocumentIdsBySerial: jest.fn(async () => new Map()),
  assertMovable: jest.fn(),
}));
jest.mock("@/features/stock-audit/services/stock-count-freeze", () => ({
  assertSerialsNotFrozenInStockCount: jest.fn(),
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
const mockPrisma = dbClient.prisma as unknown as Mocks;

const actor = { tenantId: "t1", userId: "u1", permissions: ["logistics.manage"] };
const details = { unitPackingConditionIds: ["p1"], accessoryCompletenessIds: ["a1"] };
const stockLine = {
  ...details,
  serialNumberId: "s2",
  pulloutReasonCodeId: "over",
  problemDescriptionIds: [],
  pulloutClassificationIds: ["c1"],
  remarks: " Added late ",
};
const defectiveLine = {
  ...details,
  serialNumberId: "s3",
  problemDescriptionIds: ["no-power"],
  pulloutClassificationIds: [],
};

function inventory(id: string, code: string) {
  return {
    serialNumberId: id,
    statusCode: { code },
    serialNumber: { serialNo: id, modelId: "m1" },
    defectReports: [],
  };
}

const savedList = (serialNumberIds: string[], addedLines?: (typeof stockLine | typeof defectiveLine)[]) =>
  pulloutPostingService.updateList(actor, { pulloutId: "p1", serialNumberIds, addedLines });

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.branchPullout.findFirst.mockResolvedValue({
    id: "p1",
    pulloutNo: "PLT-1",
    branchId: "b1",
    warehouseId: "w1",
    waybillNo: null,
    courierName: null,
    scheduledAt: null,
    notes: null,
    statusCodeId: "pullout_workflow-for_pullout",
    statusCode: { code: "for_pullout" },
    lines: [
      {
        serialNumberId: "s1",
        decision: "accepted",
        receivedAt: null,
        rejectedAt: null,
        serialNumber: { serialNo: "S1" },
        priorStatusCodeId: "STK",
        priorStatusCode: { code: "STK" },
      },
    ],
  });
  mockTx.branchInventory.findMany.mockImplementation(async ({ where }) => {
    const all = [inventory("s1", "FPO"), inventory("s2", "STK"), inventory("s3", "DEF")];
    return all.filter((row) => where.serialNumberId.in.includes(row.serialNumberId));
  });
  mockTx.branchInventory.updateMany.mockImplementation(async ({ where }) => ({
    count: where.serialNumberId.in.length,
  }));
  mockTx.branchPullout.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "w1" });
  mockPrisma.pulloutClassification.findMany.mockResolvedValue([{ id: "c1" }]);
  mockPrisma.unitPackingCondition.findMany.mockResolvedValue([{ id: "p1" }]);
  mockPrisma.accessoryCompleteness.findMany.mockResolvedValue([{ id: "a1" }]);
  mockPrisma.problemDescription.findMany.mockResolvedValue([{ id: "no-power" }]);
  mockPrisma.reasonStatusCode.findMany.mockResolvedValue([{ id: "over" }]);
});

describe("pulloutPostingService.updateList added serials", () => {
  it("saves an added stock unit's details", async () => {
    await savedList(["s1", "s2"], [stockLine]);

    expect(mockTx.branchPulloutLine.create).toHaveBeenCalledTimes(1);
    expect(mockTx.branchPulloutLine.create.mock.calls[0]?.[0].data).toEqual({
      pulloutId: "p1",
      serialNumberId: "s2",
      priorStatusCodeId: "inventory_system-STK",
      remarks: "Added late",
      reasonCodeId: "over",
      problemDescriptions: { create: [] },
      classifications: { create: [{ pulloutClassificationId: "c1" }] },
      packingConditions: { create: [{ unitPackingConditionId: "p1" }] },
      accessoryCompletenesses: { create: [{ accessoryCompletenessId: "a1" }] },
    });
  });

  it("gives an added defective unit the DEF reason and its problems", async () => {
    await savedList(["s1", "s3"], [defectiveLine]);

    expect(mockTx.branchPulloutLine.create.mock.calls[0]?.[0].data).toMatchObject({
      serialNumberId: "s3",
      reasonCodeId: "pullout_reason-DEF",
      problemDescriptions: { create: [{ problemDescriptionId: "no-power" }] },
      classifications: { create: [] },
    });
  });

  it("refuses an added serial with no details", async () => {
    await expect(savedList(["s1", "s2"])).rejects.toThrow("Select the serials to pull out");
    expect(mockTx.branchPulloutLine.create).not.toHaveBeenCalled();
  });

  it("refuses an added stock unit with no reason", async () => {
    await expect(
      savedList(["s1", "s2"], [{ ...stockLine, pulloutReasonCodeId: undefined as unknown as string }]),
    ).rejects.toThrow("Choose a reason for every STK unit");
    expect(mockTx.branchPulloutLine.create).not.toHaveBeenCalled();
  });

  it("refuses details that are no longer active", async () => {
    mockPrisma.problemDescription.findMany.mockResolvedValue([]);

    await expect(savedList(["s1", "s3"], [defectiveLine])).rejects.toThrow();
    expect(mockTx.branchPulloutLine.create).not.toHaveBeenCalled();
  });

  it("asks for nothing when no serial is added", async () => {
    await savedList(["s1"]);

    expect(mockTx.branchPulloutLine.create).not.toHaveBeenCalled();
    expect(mockTx.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
