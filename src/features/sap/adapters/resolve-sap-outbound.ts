import { mockSapOutbound } from "@/features/sap/adapters/mock-sap-outbound";
import { serviceLayerSapOutbound } from "@/features/sap/adapters/service-layer-sap-outbound";
import type { SapOutboundPort } from "@/features/sap/ports/sap-outbound.port";

/**
 * Select the outbound create adapter. Default is the live Service Layer adapter;
 * SAP_OUTBOUND_ADAPTER=mock selects the mock for local dev and tests.
 */
export function resolveSapOutboundPort(): SapOutboundPort {
  const adapter = (process.env.SAP_OUTBOUND_ADAPTER ?? "service_layer").trim().toLowerCase();
  return adapter === "mock" ? mockSapOutbound : serviceLayerSapOutbound;
}
