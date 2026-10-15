import type { SapOutboundPort } from "@/features/sap/ports/sap-outbound.port";

const NOT_CONFIGURED =
  "SAP Service Layer outbound create is not configured yet — implement ITR (OWTQ), SO (ORDR), and Inventory Transfer (OWTR) mapping, then set SAP_OUTBOUND_ADAPTER=service_layer";

/**
 * Live B1 create adapter (scaffolding only).
 * Methods throw until credentials + Service Layer payloads are wired.
 * Inventory Posting (P-Count) stays on the separate live path in sap.service.
 */
export const serviceLayerSapOutbound: SapOutboundPort = {
  async createApprovedOrderItrAndSo() {
    throw new Error(`${NOT_CONFIGURED} (approved order → ITR/SO)`);
  },

  async createPulloutItr() {
    throw new Error(`${NOT_CONFIGURED} (pull-out → ITR)`);
  },

  async createPartialDeliveryInventoryTransfer() {
    throw new Error(`${NOT_CONFIGURED} (partial delivery return → Inventory Transfer OWTR)`);
  },
};
