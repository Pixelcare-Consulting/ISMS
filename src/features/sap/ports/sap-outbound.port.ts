import type { SapIntegrationJob } from "@prisma/client";

import type { SapDocRef } from "@/features/sap/services/sap-documents";

/**
 * Swappable outbound contract for SAP B1 document create.
 *
 * Document vocabulary follows docs/sapb1_mapping_table_Update_gilbert_v2.pdf:
 * - Ordering: Inventory Transfer Request (ITR / OWTQ) and Sales Order (SO / ORDR)
 * - Delivery logistic: Inventory Transfer (OWTR) and Delivery Note (ODLN, DR#)
 *
 * Mock keeps today’s sapDocRef + local BranchDelivery open behavior.
 * Service Layer fills live B1 create later without rewriting order/logistics callers.
 */
export interface SapOutboundPort {
  /**
   * Process II ordering after final approval → ITR (OWTQ, consignment) or
   * SO (ORDR, outright). Opens the BranchDelivery header (Process III.A entry).
   */
  createApprovedOrderDocument(input: {
    tenantId: string;
    userId?: string;
    job: SapIntegrationJob;
  }): Promise<string>;

  /** Pull-out → Inventory Transfer Request (ITR / OWTQ). */
  createPulloutItr(input: {
    tenantId: string;
    userId?: string;
    job: SapIntegrationJob;
  }): Promise<string>;

  /**
   * Partial / rejected delivery return-to-warehouse → Inventory Transfer (OWTR).
   * Local STK/DIT movement stays in delivery-posting; this only queues the SAP doc.
   */
  createPartialDeliveryInventoryTransfer(input: {
    tenantId: string;
    userId?: string;
    job: SapIntegrationJob;
  }): Promise<string>;

  /** Dispatch → Delivery Note (DR) for an outright order, or Inventory Transfer for a consignment one. */
  createDispatchDocument(input: { tenantId: string; deliveryId: string }): Promise<SapDocRef>;

  /** Rejected / partial delivery return job (`delivery_return`). */
  createDeliveryReturnDocument(input: {
    tenantId: string;
    userId?: string;
    job: SapIntegrationJob;
  }): Promise<string>;

  /** Unit transfer between branches job (`delivery_transfer`, Inventory Transfer OWTR). */
  createDeliveryTransferDocument(input: {
    tenantId: string;
    userId?: string;
    job: SapIntegrationJob;
  }): Promise<string>;
}
