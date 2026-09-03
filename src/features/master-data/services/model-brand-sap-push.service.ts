import { SAP_NO_CONNECTION_MESSAGE } from "@/config/platform";
import { sapErrorMessage, sapText } from "@/features/sap/services/sap-master-data";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";
import { mapWithConcurrency } from "@/lib/shared/concurrency";

/**
 * Push the model import's brand column into SAP's item master as a UDF.
 *
 * This is the only place ISMS *writes* to SAP: every other Service Layer call is a
 * read (see `sap-sync-engine.ts`). Brand has no standard OITM field, so the tenant
 * carries it as the user-defined field below; the import is what keeps it in step
 * with the ISMS `Brand` a model is filed under.
 *
 * Deliberately best-effort. The ISMS side of an import is already written by the
 * time this runs, so a SAP outage, a SKU that only exists in ISMS, or a company
 * database without the UDF must report and move on — never fail the import.
 */

/** The user-defined field on OITM that holds the brand name. */
export const SAP_BRAND_UDF = "U_Brand";

/**
 * SKUs per read. Service Layer caps a page at 20 unless asked otherwise, so the
 * `Prefer` header below has to match this or a batch comes back short and every
 * unread SKU looks like it is missing from SAP.
 */
const READ_BATCH = 100;

/**
 * Lanes for the PATCHes. Lower than the database's 8: these all share one Service
 * Layer session, and B1 is far happier with a handful of concurrent writes.
 */
const PUSH_CONCURRENCY = 4;

/** Failures kept per chunk — enough for the user to act on, not a wall of text. */
const MAX_FAILURE_SAMPLES = 10;

export interface BrandPushRow {
  sku: string;
  brand: string;
}

/**
 * A type alias rather than an interface on purpose: these travel into an audit
 * record's JSON metadata, and Prisma's `InputJsonValue` only accepts object types
 * with an implicit index signature.
 */
export type BrandPushFailure = {
  sku: string;
  message: string;
};

export interface BrandPushOutcome {
  /** Rows whose `U_Brand` was written. */
  updated: number;
  /** Rows SAP already had filed under this brand — no request made. */
  matched: number;
  /** Rows whose SKU is not in the company database at all. */
  missing: number;
  /** Rows SAP refused. `failures` carries a capped sample of the same set. */
  failed: number;
  failures: BrandPushFailure[];
  /**
   * Set when nothing further can be attempted for this tenant — no connection, or
   * the UDF does not exist. The caller stops the whole push phase, since every
   * remaining row would fail the same way.
   */
  aborted?: string;
}

/** OData string literal — single quotes double, per OData's own escaping. */
function odataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * A 400 naming the UDF means the company database has no such field. Worth
 * detecting: without it a 20,000-row import makes 20,000 identical failures
 * instead of one message telling the operator to create the UDF.
 */
function isMissingUdfResponse(statusCode: number, rawBody: string): boolean {
  if (statusCode !== 400) return false;
  return rawBody.includes(SAP_BRAND_UDF);
}

function missingUdfMessage(): string {
  return (
    `SAP does not recognize the ${SAP_BRAND_UDF} field on items. ` +
    `Create the user-defined field on OITM, then run the import again to push brands.`
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "SAP request failed.";
}

/**
 * Current `U_Brand` per SKU, for the SKUs SAP actually has.
 *
 * Reading before writing is what keeps a re-import cheap: a file whose brands are
 * already in SAP costs one read per 100 rows and no writes at all.
 */
async function readCurrentBrands(
  creds: SapServiceLayerCredentials,
  skus: string[],
): Promise<Map<string, string>> {
  const current = new Map<string, string>();

  for (let index = 0; index < skus.length; index += READ_BATCH) {
    const batch = skus.slice(index, index + READ_BATCH);
    const filter = batch.map((sku) => `ItemCode eq ${odataString(sku)}`).join(" or ");
    const response = await sapServiceLayerClient.request<{
      value?: Record<string, unknown>[];
    }>({
      creds,
      method: "GET",
      path:
        `/Items?$select=ItemCode,${SAP_BRAND_UDF}` +
        `&$filter=${encodeURIComponent(filter)}`,
      headers: { Prefer: `odata.maxpagesize=${READ_BATCH}` },
    });

    if (isMissingUdfResponse(response.statusCode, response.rawBody)) {
      throw new Error(missingUdfMessage());
    }
    if (response.statusCode >= 400) {
      throw new Error(sapErrorMessage(response.statusCode, response.rawBody, "Items"));
    }

    for (const row of response.data?.value ?? []) {
      const itemCode = sapText(row.ItemCode);
      if (itemCode) current.set(itemCode.toLowerCase(), sapText(row[SAP_BRAND_UDF]));
    }
  }

  return current;
}

/** Write one item's brand. Service Layer answers a successful PATCH with 204. */
async function patchBrand(
  creds: SapServiceLayerCredentials,
  sku: string,
  brand: string,
): Promise<{ ok: true } | { ok: false; message: string; fatal?: boolean }> {
  const response = await sapServiceLayerClient.request({
    creds,
    method: "PATCH",
    path: `/Items(${encodeURIComponent(odataString(sku))})`,
    body: { [SAP_BRAND_UDF]: brand },
  });

  if (response.statusCode >= 200 && response.statusCode < 300) return { ok: true };
  if (isMissingUdfResponse(response.statusCode, response.rawBody)) {
    return { ok: false, message: missingUdfMessage(), fatal: true };
  }
  return {
    ok: false,
    message: sapErrorMessage(response.statusCode, response.rawBody, "Items"),
  };
}

export const modelBrandSapPushService = {
  /** The tenant's enabled Service Layer connection, or null when SAP is not set up. */
  getCredentials(tenantId: string): Promise<SapServiceLayerCredentials | null> {
    return sapServiceLayerService.getCredentials(tenantId);
  },

  /**
   * Bring one slice of rows in line with SAP: read what SAP holds, write only the
   * ones that differ. Rows SAP has never heard of are counted, not failed — a SKU
   * can legitimately exist in ISMS before it reaches the company database.
   */
  async pushBrands(
    creds: SapServiceLayerCredentials,
    rows: BrandPushRow[],
  ): Promise<BrandPushOutcome> {
    const empty: BrandPushOutcome = {
      updated: 0,
      matched: 0,
      missing: 0,
      failed: 0,
      failures: [],
    };
    if (rows.length === 0) return empty;

    let current: Map<string, string>;
    try {
      current = await readCurrentBrands(
        creds,
        rows.map((row) => row.sku),
      );
    } catch (error) {
      // The read is also how a missing UDF surfaces, so its failure ends the phase
      // rather than falling through to writes that would all fail the same way.
      return { ...empty, aborted: errorMessage(error) };
    }

    let matched = 0;
    let missing = 0;
    const toPush: BrandPushRow[] = [];
    for (const row of rows) {
      const existing = current.get(row.sku.toLowerCase());
      if (existing === undefined) {
        missing += 1;
        continue;
      }
      if (existing === row.brand) {
        matched += 1;
        continue;
      }
      toPush.push(row);
    }

    const failures: BrandPushFailure[] = [];
    let updated = 0;
    let failed = 0;
    let aborted: string | undefined;

    const results = await mapWithConcurrency(toPush, PUSH_CONCURRENCY, async (row) => {
      // A fatal answer from an earlier lane makes the rest pointless.
      if (aborted) return null;
      try {
        const result = await patchBrand(creds, row.sku, row.brand);
        if (!result.ok && result.fatal) aborted = result.message;
        return result;
      } catch (error) {
        return { ok: false as const, message: errorMessage(error) };
      }
    });

    for (const [index, result] of results.entries()) {
      if (!result) continue;
      if (result.ok) {
        updated += 1;
        continue;
      }
      if ("fatal" in result && result.fatal) continue;
      failed += 1;
      if (failures.length < MAX_FAILURE_SAMPLES) {
        failures.push({ sku: toPush[index].sku, message: result.message });
      }
    }

    return { updated, matched, missing, failed, failures, aborted };
  },

  noConnectionMessage(): string {
    return SAP_NO_CONNECTION_MESSAGE;
  },
};
