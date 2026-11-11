import type { Prisma } from "@/lib/database/generated/prisma/client";
import type {
  InventoryApprovalSource,
  InventoryApprovalStatus,
  InventoryApprovalStep,
} from "@/features/inventory-approvals/constants/inventory-approval-display";

type LedgerDb = Pick<Prisma.TransactionClient, "inventoryApproval">;

/** One approval step of one document. A row is this plus the unit. */
export interface InventoryApprovalDocument {
  tenantId: string;
  sourceType: InventoryApprovalSource;
  sourceId: string;
  sourceNo: string | null;
  step: InventoryApprovalStep;
}

export interface InventoryApprovalRequest {
  requestedById: string;
  units: readonly {
    serialNumberId: string;
    remarks?: string | null;
    problemDescription?: string | null;
  }[];
}

export interface InventoryApprovalDecision {
  serialNumberIds: readonly string[];
  status: Exclude<InventoryApprovalStatus, "PENDING">;
  decidedById: string;
  decidedAt?: Date;
  remarks?: string | null;
}

/**
 * The single write path into inventory_approvals. Callers pass their transaction so the
 * row commits or rolls back with the movement it describes.
 */
export const inventoryApprovalLedger = {
  async recordRequested(db: LedgerDb, doc: InventoryApprovalDocument, request: InventoryApprovalRequest) {
    if (request.units.length === 0) return;
    await db.inventoryApproval.createMany({
      data: request.units.map((unit) => ({
        ...doc,
        serialNumberId: unit.serialNumberId,
        status: "PENDING" as const,
        requestedById: request.requestedById,
        remarks: unit.remarks?.trim() || null,
        problemDescription: unit.problemDescription?.trim() || null,
      })),
      skipDuplicates: true,
    });
  },

  /**
   * Moves the units to the decided status. Any current status can move: an approved unit
   * transfer line can still be removed, and an approved delivery return can be cancelled.
   * The insert covers units requested before this ledger existed.
   */
  async recordDecision(db: LedgerDb, doc: InventoryApprovalDocument, decision: InventoryApprovalDecision) {
    if (decision.serialNumberIds.length === 0) return;
    const { tenantId, sourceType, sourceId, step } = doc;
    const decided = {
      status: decision.status,
      decidedById: decision.decidedById,
      decidedAt: decision.decidedAt ?? new Date(),
    };
    const remarks = decision.remarks?.trim() || null;

    await db.inventoryApproval.updateMany({
      where: {
        tenantId,
        sourceType,
        sourceId,
        step,
        serialNumberId: { in: [...decision.serialNumberIds] },
      },
      data: remarks ? { ...decided, remarks } : decided,
    });
    await db.inventoryApproval.createMany({
      data: decision.serialNumberIds.map((serialNumberId) => ({
        ...doc,
        serialNumberId,
        ...decided,
        remarks,
      })),
      skipDuplicates: true,
    });
  },
};
