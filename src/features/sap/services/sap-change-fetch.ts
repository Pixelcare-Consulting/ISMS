import {
  sapErrorMessage,
  sapKeyLiteral,
  sapPageSize,
} from "@/features/sap/services/sap-master-data";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";
import type { SapSyncKeyKind } from "@/features/sap/types/sap-sync-entity";

/**
 * Read-only Service Layer walks for the SAP auto-check. GET only — the check never writes
 * to SAP. Same paging as the sync engine (key order, resume after the last key, page size
 * raised with `Prefer`), kept separate so the sync engine stays untouched.
 */

export interface SapWalk {
  entity: string;
  select: string;
  filter?: string;
  keyField: string;
  keyKind: SapSyncKeyKind;
}

interface SapCollectionResponse {
  value?: Record<string, unknown>[];
}

async function getCollection(
  creds: SapServiceLayerCredentials,
  entity: string,
  query: string,
): Promise<Record<string, unknown>[]> {
  const response = await sapServiceLayerClient.request<SapCollectionResponse>({
    creds,
    method: "GET",
    path: `/${entity}?${query}`,
    // Service Layer caps page size server-side (default 20); this raises the cap.
    headers: { Prefer: `odata.maxpagesize=${sapPageSize()}` },
  });
  if (response.statusCode >= 400) {
    throw new Error(sapErrorMessage(response.statusCode, response.rawBody, entity));
  }
  return response.data?.value ?? [];
}

/**
 * Every row of `walk`, in key order. Stops early at `deadline` (epoch ms) and says so with
 * `complete: false` — a partial read can still report what it saw, but must not be used to
 * decide something is missing from SAP.
 */
export async function sapReadAll(
  creds: SapServiceLayerCredentials,
  walk: SapWalk,
  options?: { deadline?: number },
): Promise<{ rows: Record<string, unknown>[]; complete: boolean }> {
  const rows: Record<string, unknown>[] = [];
  let lastKey: string | null = null;

  for (;;) {
    const clauses: string[] = [];
    if (walk.filter) clauses.push(walk.filter);
    if (lastKey !== null) {
      clauses.push(`${walk.keyField} gt ${sapKeyLiteral(lastKey, walk.keyKind)}`);
    }
    const params = [`$select=${walk.select}`];
    if (clauses.length > 0) {
      params.push(`$filter=${encodeURIComponent(clauses.join(" and "))}`);
    }
    params.push(`$orderby=${walk.keyField}`);

    const page = await getCollection(creds, walk.entity, params.join("&"));
    if (page.length === 0) return { rows, complete: true };

    rows.push(...page);
    lastKey = String(page[page.length - 1][walk.keyField]);

    if (options?.deadline !== undefined && Date.now() >= options.deadline) {
      return { rows, complete: false };
    }
  }
}

/** The highest value of a numeric key SAP holds, or null for an empty entity. */
export async function sapMaxKey(
  creds: SapServiceLayerCredentials,
  entity: string,
  keyField: string,
): Promise<string | null> {
  const rows = await getCollection(
    creds,
    entity,
    `$select=${keyField}&$orderby=${encodeURIComponent(`${keyField} desc`)}&$top=1`,
  );
  const value = rows[0]?.[keyField];
  return value == null ? null : String(value);
}

/** OData date literal for `UpdateDate ge …` — the date part only, as SAP stores it. */
export function sapDateLiteral(date: Date): string {
  return `'${date.toISOString().slice(0, 10)}'`;
}
