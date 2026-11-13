import {
  inventoryApprovalLedger,
  type InventoryApprovalDocument,
} from "@/features/inventory-approvals/services/inventory-approval-ledger";

type LedgerDb = Parameters<typeof inventoryApprovalLedger.recordDecision>[0];

/** A branch or service center return. No serial means a TO-FOLLOW line, which has no unit to trace. */
export interface ReturnApprovalRef {
  tenantId: string;
  sourceType: "SALES_RETURN" | "SC_RETURN";
  sourceId: string;
  sourceNo: string;
  serialNumberId: string | null;
}

function stepDocument(
  ref: ReturnApprovalRef,
  step: "CS_EVALUATION" | "TL_APPROVAL",
): InventoryApprovalDocument {
  const { tenantId, sourceType, sourceId, sourceNo } = ref;
  return { tenantId, sourceType, sourceId, sourceNo, step };
}

export async function recordReturnRequested(
  db: LedgerDb,
  ref: ReturnApprovalRef,
  request: { requestedById: string; remarks?: string | null; problemDescription?: string | null },
  step: "CS_EVALUATION" | "TL_APPROVAL" = "CS_EVALUATION",
) {
  if (!ref.serialNumberId) return;
  await inventoryApprovalLedger.recordRequested(db, stepDocument(ref, step), {
    requestedById: request.requestedById,
    units: [
      {
        serialNumberId: ref.serialNumberId,
        remarks: request.remarks,
        problemDescription: request.problemDescription,
      },
    ],
  });
}

export async function recordReturnEvaluated(
  db: LedgerDb,
  ref: ReturnApprovalRef,
  evaluation: { decidedById: string; remarks?: string | null; needsTl: boolean },
) {
  if (!ref.serialNumberId) return;
  await inventoryApprovalLedger.recordDecision(db, stepDocument(ref, "CS_EVALUATION"), {
    serialNumberIds: [ref.serialNumberId],
    status: "APPROVED",
    decidedById: evaluation.decidedById,
    remarks: evaluation.remarks,
  });
  if (!evaluation.needsTl) return;
  await inventoryApprovalLedger.recordRequested(db, stepDocument(ref, "TL_APPROVAL"), {
    requestedById: evaluation.decidedById,
    units: [{ serialNumberId: ref.serialNumberId }],
  });
}

export async function recordReturnApproved(db: LedgerDb, ref: ReturnApprovalRef, decidedById: string) {
  if (!ref.serialNumberId) return;
  await inventoryApprovalLedger.recordDecision(db, stepDocument(ref, "TL_APPROVAL"), {
    serialNumberIds: [ref.serialNumberId],
    status: "APPROVED",
    decidedById,
  });
}

export async function recordReturnRejected(
  db: LedgerDb,
  ref: ReturnApprovalRef,
  rejection: { fromStatus: string; decidedById: string; remarks?: string | null },
) {
  if (!ref.serialNumberId) return;
  const step = rejection.fromStatus === "pending_cs" ? "CS_EVALUATION" : "TL_APPROVAL";
  await inventoryApprovalLedger.recordDecision(db, stepDocument(ref, step), {
    serialNumberIds: [ref.serialNumberId],
    status: "REJECTED",
    decidedById: rejection.decidedById,
    remarks: rejection.remarks,
  });
}
