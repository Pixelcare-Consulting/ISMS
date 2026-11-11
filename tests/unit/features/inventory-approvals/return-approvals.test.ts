import {
  recordReturnApproved,
  recordReturnEvaluated,
  recordReturnRejected,
  recordReturnRequested,
  type ReturnApprovalRef,
} from "@/features/inventory-approvals/services/return-approvals";
import { inventoryApprovalLedger } from "@/features/inventory-approvals/services/inventory-approval-ledger";

jest.mock("@/features/inventory-approvals/services/inventory-approval-ledger", () => ({
  inventoryApprovalLedger: { recordRequested: jest.fn(), recordDecision: jest.fn() },
}));

const ledger = jest.mocked(inventoryApprovalLedger);
const db = {} as never;
const ref: ReturnApprovalRef = {
  tenantId: "t1",
  sourceType: "SALES_RETURN",
  sourceId: "return-1",
  sourceNo: "TXN-1",
  serialNumberId: "s1",
};
const document = (step: string) => ({
  tenantId: "t1",
  sourceType: "SALES_RETURN",
  sourceId: "return-1",
  sourceNo: "TXN-1",
  step,
});

beforeEach(() => jest.clearAllMocks());

describe("return approvals", () => {
  it("opens CS evaluation when the return is requested", async () => {
    await recordReturnRequested(db, ref, { requestedById: "u1", problemDescription: "No power" });

    expect(ledger.recordRequested).toHaveBeenCalledWith(db, document("CS_EVALUATION"), {
      requestedById: "u1",
      units: [{ serialNumberId: "s1", remarks: undefined, problemDescription: "No power" }],
    });
  });

  it("records nothing for a sale line that has no serial yet", async () => {
    const toFollow = { ...ref, serialNumberId: null };

    await recordReturnRequested(db, toFollow, { requestedById: "u1" });
    await recordReturnEvaluated(db, toFollow, { decidedById: "u2", needsTl: true });
    await recordReturnApproved(db, toFollow, "u3");
    await recordReturnRejected(db, toFollow, { fromStatus: "pending_cs", decidedById: "u2" });

    expect(ledger.recordRequested).not.toHaveBeenCalled();
    expect(ledger.recordDecision).not.toHaveBeenCalled();
  });

  it("opens TL approval once CS passes a return that needs it", async () => {
    await recordReturnEvaluated(db, ref, { decidedById: "u2", remarks: "Checked", needsTl: true });

    expect(ledger.recordDecision).toHaveBeenCalledWith(db, document("CS_EVALUATION"), {
      serialNumberIds: ["s1"],
      status: "APPROVED",
      decidedById: "u2",
      remarks: "Checked",
    });
    expect(ledger.recordRequested).toHaveBeenCalledWith(db, document("TL_APPROVAL"), {
      requestedById: "u2",
      units: [{ serialNumberId: "s1" }],
    });
  });

  it("stops at CS when the return skips the Team Leader", async () => {
    await recordReturnEvaluated(db, ref, { decidedById: "u2", needsTl: false });

    expect(ledger.recordDecision).toHaveBeenCalledTimes(1);
    expect(ledger.recordRequested).not.toHaveBeenCalled();
  });

  it("closes TL approval on approve", async () => {
    await recordReturnApproved(db, ref, "u3");

    expect(ledger.recordDecision).toHaveBeenCalledWith(db, document("TL_APPROVAL"), {
      serialNumberIds: ["s1"],
      status: "APPROVED",
      decidedById: "u3",
    });
  });

  it.each([
    ["pending_cs", "CS_EVALUATION"],
    ["pending_tl", "TL_APPROVAL"],
  ] as const)("rejects the step a %s return is waiting on", async (fromStatus, step) => {
    await recordReturnRejected(db, ref, { fromStatus, decidedById: "u3", remarks: "Past warranty" });

    expect(ledger.recordDecision).toHaveBeenCalledWith(db, document(step), {
      serialNumberIds: ["s1"],
      status: "REJECTED",
      decidedById: "u3",
      remarks: "Past warranty",
    });
  });
});
