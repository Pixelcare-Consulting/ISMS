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

type ReturnApprovalStep = "INSPECTION" | "CS_EVALUATION" | "TL_APPROVAL";

function stepDocument(ref: ReturnApprovalRef, step: ReturnApprovalStep): InventoryApprovalDocument {
  const { tenantId, sourceType, sourceId, sourceNo } = ref;
  return { tenantId, sourceType, sourceId, sourceNo, step };
}

export async function recordReturnRequested(
  db: LedgerDb,
  ref: ReturnApprovalRef,
  request: { requestedById: string; remarks?: string | null; problemDescription?: string | null },
  step: ReturnApprovalStep = "CS_EVALUATION",
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

/**
 * A Service Return / Replacement is decided by the service center at inspection: finishing
 * the request approves the step, rejecting it rejects the step.
 */
export async function recordServiceInspectionDecided(
  db: LedgerDb,
  ref: ReturnApprovalRef,
  decision: { status: "APPROVED" | "REJECTED"; decidedById: string; remarks?: string | null },
) {
  if (!ref.serialNumberId) return;
  await inventoryApprovalLedger.recordDecision(db, stepDocument(ref, "INSPECTION"), {
    serialNumberIds: [ref.serialNumberId],
    status: decision.status,
    decidedById: decision.decidedById,
    remarks: decision.remarks,
  });
}
