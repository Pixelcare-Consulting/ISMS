import type { SapIntegrationJob } from "@prisma/client";


/**
 * Swappable outbound contract for SAP B1 document create.
 *
 * Document vocabulary follows docs/sapb1_mapping_table_Update_gilbert_v2.pdf:
 * - Ordering: Inventory Transfer Request (ITR / OWTQ) and Sales Order (SO / ORDR)
 * - Delivery logistic: Inventory Transfer (OWTR) and Delivery Note (ODLN, DR#)
 *
 * The Service Layer adapter is the default and posts live B1 documents (ordering,
 * dispatch, unit transfer, delivery return; pull-out still delegates to the
 * mock). The mock (SAP_OUTBOUND_ADAPTER=mock) returns fake refs for local dev.
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

  /** Legacy `delivery_partial_return` jobs queued before returns needed approval. No new ones are queued. */
  createPartialDeliveryInventoryTransfer(input: {
    tenantId: string;
    userId?: string;
    job: SapIntegrationJob;
  }): Promise<string>;

  /**
   * Approved delivery return job (`delivery_return`): IT back to the source
   * warehouse for consignment, Return based on the DR for outright. On success
   * the units move back to their warehouse locations in the same call.
   */
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
