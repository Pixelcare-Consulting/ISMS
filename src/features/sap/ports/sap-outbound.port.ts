import type { SapIntegrationJob } from "@prisma/client";

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
   * Process II ordering after SP approve → ITR (OWTQ) + SO (ORDR).
   * Opens local BranchDelivery as Process III.A entry (Delivery Note / Inventory
   * Transfer numbers land in sapDocRef when live).
   */
  createApprovedOrderItrAndSo(input: {
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
}
