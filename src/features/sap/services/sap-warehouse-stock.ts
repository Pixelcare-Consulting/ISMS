import { sapErrorMessage, sapPageSize, sapText } from "@/features/sap/services/sap-master-data";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";

/** Runaway guard on `odata.nextLink` chains; a warehouse holds tens of items, not thousands of pages. */
const MAX_PAGES = 200;

/** An item SAP has in stock in one warehouse (OITW), per item rather than per serial. */
export interface SapWarehouseItemStock {
  itemCode: string;
  inStock: number;
  committed: number;
  /** In stock less what open Sales Orders already hold; never below zero. */
  available: number;
}

interface CrossjoinRow {
  Items?: { ItemCode?: unknown };
  "Items/ItemWarehouseInfoCollection"?: { InStock?: unknown; Committed?: unknown };
}

interface CrossjoinResponse {
  value?: CrossjoinRow[];
  "odata.nextLink"?: string;
  "@odata.nextLink"?: string;
}

function quantity(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Items in stock in `warehouseCode`, read from the item's warehouse lines through a
 * `$crossjoin` filtered in SAP. Per item, so it is one quick call (FWH14P1F: 56 items in
 * ~1.6 s, 2026-10-30) where walking its serials took minutes (137k serials).
 */
export async function fetchSapWarehouseItemStock(
  creds: SapServiceLayerCredentials,
  warehouseCode: string,
): Promise<SapWarehouseItemStock[]> {
  const whs = warehouseCode.replace(/'/g, "''");
  const query = [
    "$expand=Items($select=ItemCode),Items/ItemWarehouseInfoCollection($select=InStock,Committed)",
    `$filter=Items/ItemCode eq Items/ItemWarehouseInfoCollection/ItemCode and Items/ItemWarehouseInfoCollection/WarehouseCode eq '${whs}' and Items/ItemWarehouseInfoCollection/InStock gt 0`,
  ]
    .map((part) => encodeURI(part).replace(/'/g, "%27"))
    .join("&");
  let path: string | null = `/$crossjoin(Items,Items/ItemWarehouseInfoCollection)?${query}`;

  const stock: SapWarehouseItemStock[] = [];
  for (let page = 0; path; page += 1) {
    if (page >= MAX_PAGES) throw new Error(`Stopped reading warehouse stock after ${MAX_PAGES} pages.`);
    const response: Awaited<ReturnType<typeof sapServiceLayerClient.request<CrossjoinResponse>>> =
      await sapServiceLayerClient.request<CrossjoinResponse>({
        creds,
        method: "GET",
        path,
        headers: { Prefer: `odata.maxpagesize=${sapPageSize()}` },
      });
    if (response.statusCode >= 400) {
      throw new Error(sapErrorMessage(response.statusCode, response.rawBody, "Items"));
    }
    for (const row of response.data?.value ?? []) {
      const itemCode = sapText(row.Items?.ItemCode);
      const line = row["Items/ItemWarehouseInfoCollection"];
      if (!itemCode || !line) continue;
      const inStock = quantity(line.InStock);
      const committed = quantity(line.Committed);
      stock.push({ itemCode, inStock, committed, available: Math.max(0, inStock - committed) });
    }
    const next: string | undefined =
      response.data?.["odata.nextLink"] ?? response.data?.["@odata.nextLink"];
    path = next ? `/${next.replace(/^\/+/, "")}` : null;
  }
  return stock;
}
