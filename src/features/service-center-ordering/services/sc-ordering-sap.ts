import { sapErrorMessage, sapText } from "@/features/sap/services/sap-master-data";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";

/** Projects are a short SAP list (tens of rows); one page covers it, with room to spare. */
const SAP_PROJECTS_PAGE = 500;

export interface SapProjectOption {
  code: string;
  name: string | null;
}

async function credentials(tenantId: string) {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) throw new Error("SAP Service Layer is not configured");
  return creds;
}

function quoted(value: string): string {
  return encodeURIComponent(value.replace(/'/g, "''"));
}

/**
 * Active SAP projects (OPRJ), read live: the SO line's ProjectCode must be one of them,
 * so the order form offers exactly SAP's list instead of free text SAP would reject.
 */
export async function listSapProjects(tenantId: string): Promise<SapProjectOption[]> {
  const creds = await credentials(tenantId);
  const result = await sapServiceLayerClient.request<{ value?: { Code?: string; Name?: string }[] }>({
    creds,
    method: "GET",
    path: `/Projects?$select=Code,Name&$filter=Active eq 'tYES'&$orderby=Code`,
    headers: { Prefer: `odata.maxpagesize=${SAP_PROJECTS_PAGE}` },
  });
  if (result.statusCode >= 400) {
    throw new Error(sapErrorMessage(result.statusCode, result.rawBody, "Projects"));
  }
  return (result.data?.value ?? [])
    .map((row) => ({ code: sapText(row.Code), name: sapText(row.Name) || null }))
    .filter((row) => row.code);
}

/** True when `code` is an active SAP project. */
export async function isSapProject(tenantId: string, code: string): Promise<boolean> {
  const projects = await listSapProjects(tenantId);
  return projects.some((project) => project.code === code);
}

/** The SAP customer behind `cardCode`, or null when SAP has no such customer. */
export async function findSapCustomer(
  tenantId: string,
  cardCode: string,
): Promise<{ cardCode: string; cardName: string | null } | null> {
  const creds = await credentials(tenantId);
  const result = await sapServiceLayerClient.request<{ CardCode?: string; CardName?: string; CardType?: string }>({
    creds,
    method: "GET",
    path: `/BusinessPartners('${quoted(cardCode)}')?$select=CardCode,CardName,CardType`,
  });
  if (result.statusCode === 404) return null;
  if (result.statusCode >= 400) {
    throw new Error(sapErrorMessage(result.statusCode, result.rawBody, "BusinessPartners"));
  }
  if (result.data?.CardType !== "cCustomer") return null;
  return { cardCode: sapText(result.data.CardCode), cardName: sapText(result.data.CardName) || null };
}
