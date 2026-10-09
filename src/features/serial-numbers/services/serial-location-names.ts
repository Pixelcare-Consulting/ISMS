import { sapText } from "@/features/sap/services/sap-master-data";
import {
  sapServiceLayerClient,
  type SapServiceLayerRequestResult,
} from "@/features/sap/services/sap-service-layer-client";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";
import { logger } from "@/lib/shared/logger";

/** Warehouse codes are short SAP keys. Anything else is not sent in a filter. */
const SAFE_WAREHOUSE_CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$/;

const NAME_TTL_MS = 10 * 60 * 1000;
const MISS_TTL_MS = 60 * 1000;

const nameCache = new Map<string, { name: string | null; expires: number }>();

interface NamedLocation {
  branchCode: string | null;
  branchName: string | null;
}

/**
 * Fill a missing location name. A name already taken from Branches or Warehouses stays.
 */
export function applyWarehouseNames<T extends NamedLocation>(
  items: T[],
  names: ReadonlyMap<string, string>,
): T[] {
  return items.map((item) => {
    if (item.branchName || !item.branchCode) return item;
    const name = names.get(item.branchCode);
    if (!name) return item;
    return { ...item, branchName: name };
  });
}

/** Codes on this page that still have no name in ISMS. */
export function warehouseCodesMissingNames(items: NamedLocation[]): string[] {
  const missing = new Set<string>();
  for (const item of items) {
    if (item.branchCode && !item.branchName && SAFE_WAREHOUSE_CODE.test(item.branchCode)) {
      missing.add(item.branchCode);
    }
  }
  return [...missing];
}

interface WarehouseNamePage {
  value?: Record<string, unknown>[];
  "odata.nextLink"?: string;
  "@odata.nextLink"?: string;
}

async function fetchWarehouseNames(
  creds: SapServiceLayerCredentials,
  codes: string[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const filter = codes.map((code) => `WarehouseCode eq '${code}'`).join(" or ");
  let path: string | null =
    `/Warehouses?$select=WarehouseCode,WarehouseName&$filter=${encodeURIComponent(filter)}`;

  for (let page = 0; path && page < 5; page += 1) {
    const response: SapServiceLayerRequestResult<WarehouseNamePage> =
      await sapServiceLayerClient.request<WarehouseNamePage>({
        creds,
        method: "GET",
        path,
        headers: { Prefer: "odata.maxpagesize=100" },
      });
    if (response.statusCode >= 400) {
      logger.warn(
        { statusCode: response.statusCode, codes: codes.length },
        "Warehouse names were not loaded",
      );
      return found;
    }
    for (const row of response.data?.value ?? []) {
      const code = sapText(row.WarehouseCode);
      const name = sapText(row.WarehouseName);
      if (code && name) found.set(code, name);
    }
    const next: string | undefined =
      response.data?.["odata.nextLink"] ?? response.data?.["@odata.nextLink"];
    path = next ? `/${next.replace(/^\/+/, "")}` : null;
  }
  return found;
}

/**
 * Names for warehouse codes that are not branches in ISMS.
 * A failed read leaves those names blank; the code and quantity still show.
 */
export async function loadWarehouseNames(
  tenantId: string,
  codes: string[],
): Promise<Map<string, string>> {
  const now = Date.now();
  const names = new Map<string, string>();
  const missing: string[] = [];

  for (const code of codes) {
    if (!SAFE_WAREHOUSE_CODE.test(code)) continue;
    const cached = nameCache.get(`${tenantId}:${code}`);
    if (cached && cached.expires > now) {
      if (cached.name) names.set(code, cached.name);
      continue;
    }
    missing.push(code);
  }
  if (missing.length === 0) return names;

  try {
    const creds = await sapServiceLayerService.getCredentials(tenantId);
    if (!creds) return names;
    const fetched = await fetchWarehouseNames(creds, missing);
    for (const code of missing) {
      const name = fetched.get(code) ?? null;
      nameCache.set(`${tenantId}:${code}`, {
        name,
        expires: now + (name ? NAME_TTL_MS : MISS_TTL_MS),
      });
      if (name) names.set(code, name);
    }
  } catch (error) {
    logger.warn({ err: error, tenantId }, "Warehouse names were not loaded");
  }
  return names;
}
