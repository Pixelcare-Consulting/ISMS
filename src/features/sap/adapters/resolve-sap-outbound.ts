import { mockSapOutbound } from "@/features/sap/adapters/mock-sap-outbound";
import { serviceLayerSapOutbound } from "@/features/sap/adapters/service-layer-sap-outbound";
import type { SapOutboundPort } from "@/features/sap/ports/sap-outbound.port";

/**
 * Select outbound create adapter.
 *
 * Default: Mock (mock sapDocRef + open local BranchDelivery) so connecting
 * Service Layer credentials for Inventory Posting / master sync does not break
 * ITR/SO/OWTR jobs until live create is implemented.
 *
 * Swap to Service Layer later:
 * 1. Implement create methods on serviceLayerSapOutbound (OWTQ / ORDR / OWTR).
 * 2. Set SAP_OUTBOUND_ADAPTER=service_layer
 */
export function resolveSapOutboundPort(): SapOutboundPort {
  const adapter = (process.env.SAP_OUTBOUND_ADAPTER ?? "mock").trim().toLowerCase();
  if (adapter === "service_layer" || adapter === "sl") {
    return serviceLayerSapOutbound;
  }
  return mockSapOutbound;
}
