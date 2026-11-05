jest.mock("@/lib/database/client", () => {
  const tx = {
    $queryRaw: jest.fn(),
    branchInventory: { findMany: jest.fn(), updateMany: jest.fn() },
    branchPullout: { create: jest.fn() },
    serialNumberHistory: { createMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  return {
    mockTx: tx,
    prisma: {
      branch: { findFirst: jest.fn() },
      warehouse: { findFirst: jest.fn() },
      branchInventory: tx.branchInventory,
      branchTransferLine: { findMany: jest.fn() },
      branchPulloutLine: { findMany: jest.fn() },
      branchDefectReport: { findFirst: jest.fn() },
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

const actor = { tenantId: "t1", userId: "u1", permissions: ["logistics.create"] };
const details = { pulloutClassificationIds: [], unitPackingConditionIds: ["p1"], accessoryCompletenessIds: ["a1"] };
const stockLine = {
  ...details,
  serialNumberId: "s1",
  pulloutClassificationIds: ["c1"],
  pulloutReasonCodeId: "over",
  problemDescriptionIds: [],
};
const defectiveLine = { ...details, serialNumberId: "s2", problemDescriptionIds: ["no-power"] };

function serial(id: string, code: string) {
  return {
    serialNumberId: id,
    statusCode: { code },
    serialNumber: { serialNo: id, modelId: "m1" },
    defectReports: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.branch.findFirst.mockResolvedValue({
    name: "Branch A",
    primaryWarehouse: { id: "w1", name: "Main", code: "W1", deletedAt: null },
  });
  mockPrisma.warehouse.findFirst.mockResolvedValue(null);
  mockTx.branchInventory.findMany.mockResolvedValue([serial("s1", "STK"), serial("s2", "DEF")]);
  mockTx.branchInventory.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.branchTransferLine.findMany.mockResolvedValue([]);
  mockPrisma.branchPulloutLine.findMany.mockResolvedValue([]);
  mockPrisma.pulloutClassification.findMany.mockResolvedValue([{ id: "c1" }]);
  mockPrisma.unitPackingCondition.findMany.mockResolvedValue([{ id: "p1" }]);
  mockPrisma.accessoryCompleteness.findMany.mockResolvedValue([{ id: "a1" }]);
  mockPrisma.problemDescription.findMany.mockResolvedValue([{ id: "no-power" }]);
  mockPrisma.reasonStatusCode.findMany.mockResolvedValue([{ id: "over" }]);
  mockTx.branchPullout.create.mockResolvedValue({ id: "p1", pulloutNo: "PLT-1" });
});

describe("pulloutPostingService.create reasons", () => {
  it("saves a stock unit's reason, and gives a defective unit the DEF reason and its problems", async () => {
    await pulloutPostingService.create(actor, { branchId: "b1", lines: [stockLine, defectiveLine] });

    const lines = mockTx.branchPullout.create.mock.calls[0]?.[0].data.lines.create;
    expect(lines[0]).toMatchObject({
      serialNumberId: "s1",
      reasonCodeId: "over",
      problemDescriptions: { create: [] },
    });
    expect(lines[1]).toMatchObject({
      serialNumberId: "s2",
      reasonCodeId: "pullout_reason-DEF",
      problemDescriptions: { create: [{ problemDescriptionId: "no-power" }] },
    });
  });

  it("refuses a stock unit with no reason", async () => {
    await expect(
      pulloutPostingService.create(actor, {
        branchId: "b1",
        lines: [{ ...stockLine, pulloutReasonCodeId: undefined }, defectiveLine],
      }),
    ).rejects.toThrow("Choose a reason for every STK unit");
    expect(mockTx.branchPullout.create).not.toHaveBeenCalled();
  });

  it("refuses a defective unit with no problem description", async () => {
    await expect(
      pulloutPostingService.create(actor, {
        branchId: "b1",
        lines: [stockLine, { ...defectiveLine, problemDescriptionIds: [] }],
      }),
    ).rejects.toThrow("Choose a problem description for every DEF unit");
  });

  it("refuses a reason outside the active stock reasons", async () => {
    mockPrisma.reasonStatusCode.findMany.mockResolvedValue([]);

    await expect(
      pulloutPostingService.create(actor, { branchId: "b1", lines: [stockLine, defectiveLine] }),
    ).rejects.toThrow();
    expect(mockTx.branchPullout.create).not.toHaveBeenCalled();
  });
});
