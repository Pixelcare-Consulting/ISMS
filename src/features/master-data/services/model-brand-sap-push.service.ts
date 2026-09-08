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

/** The UDF as named in SAP's own dialog. The OData property is `U_` + this. */
export const SAP_BRAND_UDF_NAME = "Brand";

/** The user-defined field on OITM that holds the brand name. */
export const SAP_BRAND_UDF = `U_${SAP_BRAND_UDF_NAME}`;

/**
 * How long a fetched field definition is reused. The definition changes only when
 * someone edits the UDF in SAP, so this is about not re-reading it once per chunk;
 * a short life keeps a newly added valid value from waiting long to take effect.
 */
const FIELD_DEFINITION_TTL_MS = 5 * 60 * 1000;

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

/**
 * The UDF's allowed values, when it was set up as a list field.
 *
 * A B1 UDF can be free text or a fixed list ("Set Valid Values for Field"). A list
 * accepts only its own spellings, so pushing ISMS's spelling verbatim would be
 * refused for a brand that differs by so much as its casing. Reading the definition
 * lets the push send what SAP will actually take, and say something useful about a
 * brand SAP has no value for.
 */
interface BrandFieldDefinition {
  /** Lowercased valid value → the exact spelling SAP expects. Empty when free text. */
  validValues: Map<string, string>;
}

const fieldDefinitionCache = new Map<
  string,
  { definition: BrandFieldDefinition; expiresAt: number }
>();

async function loadFieldDefinition(
  creds: SapServiceLayerCredentials,
): Promise<BrandFieldDefinition> {
  const cacheKey = creds.id ?? `${creds.baseUrl}|${creds.companyDb}`;
  const cached = fieldDefinitionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.definition;

  const filter = `TableName eq 'OITM' and Name eq '${SAP_BRAND_UDF_NAME}'`;
  const response = await sapServiceLayerClient.request<{
    value?: { ValidValuesMD?: { Value?: unknown }[] }[];
  }>({
    creds,
    method: "GET",
    path: `/UserFieldsMD?$filter=${encodeURIComponent(filter)}`,
  });

  // Metadata being unreadable is not worth failing the push over — fall back to
  // sending the brand as ISMS spells it and let SAP have the final say per row.
  const validValues = new Map<string, string>();
  if (response.statusCode === 200) {
    const [field] = response.data?.value ?? [];
    for (const entry of field?.ValidValuesMD ?? []) {
      const value = sapText(entry.Value);
      if (value) validValues.set(value.toLowerCase(), value);
    }
  }

  const definition: BrandFieldDefinition = { validValues };
  fieldDefinitionCache.set(cacheKey, {
    definition,
    expiresAt: Date.now() + FIELD_DEFINITION_TTL_MS,
  });
  return definition;
}

/**
 * What to actually write for this brand: SAP's own spelling when the field is a
 * list, the brand as given when it is free text, or a reason it cannot be written.
 */
function resolveValue(
  definition: BrandFieldDefinition,
  brand: string,
): { value: string } | { rejected: string } {
  if (definition.validValues.size === 0) return { value: brand };

  const match = definition.validValues.get(brand.toLowerCase());
  if (match) return { value: match };

  const allowed = [...definition.validValues.values()].join(", ");
  return {
    rejected:
      `SAP only accepts these values for ${SAP_BRAND_UDF}: ${allowed}. ` +
      `Add "${brand}" to the field's valid values in SAP, or rename the brand to match.`,
  };
}

/** OData string literal — single quotes double, per OData's own escaping. */
function odataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Does this 400 look like SAP objecting to the field itself, rather than to
 * something else about the request?
 *
 * Naming the field is not enough on its own — Service Layer errors often echo the
 * query back, and the query contains the field name, so a complaint about anything
 * else in it would read as a missing UDF. Requiring a "does not exist" flavoured
 * word alongside it keeps the two apart. The check only chooses which hint to add;
 * SAP's own text is reported either way, so a wrong guess here misleads no one.
 */
function looksLikeMissingUdf(statusCode: number, rawBody: string): boolean {
  if (statusCode !== 400) return false;
  if (!rawBody.includes(SAP_BRAND_UDF)) return false;
  return /exist|invalid|unknown|not found|cannot find|no such/i.test(rawBody);
}

/** SAP's own words first, then what to do about it when we can tell. */
function describeItemsFailure(statusCode: number, rawBody: string): string {
  const sapSaid = sapErrorMessage(statusCode, rawBody, "Items");
  if (!looksLikeMissingUdf(statusCode, rawBody)) return sapSaid;
  return (
    `${sapSaid} — SAP does not recognize the ${SAP_BRAND_UDF} field on items. ` +
    `Check that the user-defined field exists on OITM and that its name matches ` +
    `exactly (case-sensitive): a UDF named "Brand" is the property ${SAP_BRAND_UDF}.`
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

    if (response.statusCode >= 400) {
      throw new Error(describeItemsFailure(response.statusCode, response.rawBody));
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

  // A field SAP does not have will refuse every remaining row identically, so that
  // one case ends the phase instead of repeating itself thousands of times.
  return {
    ok: false,
    message: describeItemsFailure(response.statusCode, response.rawBody),
    fatal: looksLikeMissingUdf(response.statusCode, response.rawBody),
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

    // Free text unless SAP says otherwise; a metadata failure is not fatal here.
    let definition: BrandFieldDefinition = { validValues: new Map() };
    try {
      definition = await loadFieldDefinition(creds);
    } catch {
      // Fall through with no valid values — SAP still refuses anything it dislikes.
    }

    const failures: BrandPushFailure[] = [];
    let updated = 0;
    let failed = 0;
    let matched = 0;
    let missing = 0;
    let aborted: string | undefined;

    const addFailure = (sku: string, message: string) => {
      failed += 1;
      if (failures.length < MAX_FAILURE_SAMPLES) failures.push({ sku, message });
    };

    const toPush: BrandPushRow[] = [];
    for (const row of rows) {
      const existing = current.get(row.sku.toLowerCase());
      if (existing === undefined) {
        missing += 1;
        continue;
      }

      const resolved = resolveValue(definition, row.brand);
      if ("rejected" in resolved) {
        addFailure(row.sku, resolved.rejected);
        continue;
      }
      // Compare against what would actually be written, so a brand that differs
      // from SAP only in casing on a list field counts as already correct.
      if (existing === resolved.value) {
        matched += 1;
        continue;
      }
      toPush.push({ sku: row.sku, brand: resolved.value });
    }

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
      addFailure(toPush[index].sku, result.message);
    }

    return { updated, matched, missing, failed, failures, aborted };
  },

  noConnectionMessage(): string {
    return SAP_NO_CONNECTION_MESSAGE;
  },
};
