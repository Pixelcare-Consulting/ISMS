import { inventoryApprovalLedger } from "@/features/inventory-approvals/services/inventory-approval-ledger";

function fakeDb() {
  return {
    inventoryApproval: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

const doc = {
  tenantId: "t1",
  sourceType: "TRANSFER",
  sourceId: "transfer-1",
  sourceNo: "XFR-1",
  step: "TL_APPROVAL",
} as const;

describe("inventoryApprovalLedger.recordRequested", () => {
  it("opens one pending row per unit, keeping each unit's own remarks", async () => {
    const db = fakeDb();

    await inventoryApprovalLedger.recordRequested(db as never, doc, {
      requestedById: "u1",
      units: [
        { serialNumberId: "s1", remarks: "Scratched", problemDescription: "No power" },
        { serialNumberId: "s2" },
      ],
    });

    expect(db.inventoryApproval.createMany).toHaveBeenCalledWith({
      data: [
        {
          ...doc,
          serialNumberId: "s1",
          status: "PENDING",
          requestedById: "u1",
          remarks: "Scratched",
          problemDescription: "No power",
        },
        {
          ...doc,
          serialNumberId: "s2",
          status: "PENDING",
          requestedById: "u1",
          remarks: null,
          problemDescription: null,
        },
      ],
      skipDuplicates: true,
    });
  });

  it("writes nothing for a document with no units", async () => {
    const db = fakeDb();

    await inventoryApprovalLedger.recordRequested(db as never, doc, { requestedById: "u1", units: [] });

    expect(db.inventoryApproval.createMany).not.toHaveBeenCalled();
  });
});

describe("inventoryApprovalLedger.recordDecision", () => {
  const decidedAt = new Date("2026-11-06T02:00:00.000Z");

  it("updates the existing rows, whatever their current status", async () => {
    const db = fakeDb();

    await inventoryApprovalLedger.recordDecision(db as never, doc, {
      serialNumberIds: ["s1", "s2"],
      status: "REJECTED",
      decidedById: "u2",
      decidedAt,
      remarks: " Wrong branch ",
    });

    expect(db.inventoryApproval.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        sourceType: "TRANSFER",
        sourceId: "transfer-1",
        step: "TL_APPROVAL",
        serialNumberId: { in: ["s1", "s2"] },
      },
      data: { status: "REJECTED", decidedById: "u2", decidedAt, remarks: "Wrong branch" },
    });
  });

  it("keeps the request's remarks when the decision has none", async () => {
    const db = fakeDb();

    await inventoryApprovalLedger.recordDecision(db as never, doc, {
      serialNumberIds: ["s1"],
      status: "APPROVED",
      decidedById: "u2",
      decidedAt,
      remarks: "   ",
    });

    expect(db.inventoryApproval.updateMany.mock.calls[0][0].data).toEqual({
      status: "APPROVED",
      decidedById: "u2",
      decidedAt,
    });
  });

  it("adds a row for a unit requested before the ledger existed", async () => {
    const db = fakeDb();

    await inventoryApprovalLedger.recordDecision(db as never, doc, {
      serialNumberIds: ["s1"],
      status: "APPROVED",
      decidedById: "u2",
      decidedAt,
    });

    expect(db.inventoryApproval.createMany).toHaveBeenCalledWith({
      data: [
        {
          ...doc,
          serialNumberId: "s1",
          status: "APPROVED",
          decidedById: "u2",
          decidedAt,
          remarks: null,
        },
      ],
      skipDuplicates: true,
    });
  });

  it("does nothing when no unit was decided", async () => {
    const db = fakeDb();

    await inventoryApprovalLedger.recordDecision(db as never, doc, {
      serialNumberIds: [],
      status: "APPROVED",
      decidedById: "u2",
    });

    expect(db.inventoryApproval.updateMany).not.toHaveBeenCalled();
    expect(db.inventoryApproval.createMany).not.toHaveBeenCalled();
  });

  it("stamps the decision time when none is given", async () => {
    const db = fakeDb();

    await inventoryApprovalLedger.recordDecision(db as never, doc, {
      serialNumberIds: ["s1"],
      status: "CANCELLED",
      decidedById: "u2",
    });

    expect(db.inventoryApproval.updateMany.mock.calls[0][0].data.decidedAt).toBeInstanceOf(Date);
  });
});
