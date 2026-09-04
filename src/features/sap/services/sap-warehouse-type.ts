/**
 * The SAP warehouse-type UDF (`OWHS.U_Warehouse_Type`), which decides what an ISMS
 * warehouse row actually *is*.
 *
 * SAP keeps every physical location in one place — `Warehouses` — and distinguishes a
 * retail branch from a stocking warehouse from a service centre only by this field. ISMS
 * models those as three separate tables, so the type is the routing key: one Service
 * Layer entity feeds `branches`, `warehouses` and `service_centers`.
 *
 * Confirmed against the live company database (`scripts/check-sap-warehouse-type-udf.mjs`):
 * the UDF is a *list* field with exactly the three values below, so SAP itself rejects
 * anything else and the values can be compared exactly — no casing or whitespace
 * tolerance is needed, and none is applied. What the field *is* routinely is null: it was
 * added after the warehouses were, so most rows are still untyped and stay unroutable
 * until someone fills them in.
 */

/** Service Layer property name for the UDF (SAP prefixes user fields with `U_`). */
export const SAP_WAREHOUSE_TYPE_FIELD = "U_Warehouse_Type";

/** The three values SAP's list field accepts, spelled exactly as SAP stores them. */
export const SAP_WAREHOUSE_TYPES = {
  branch: "Branch",
  warehouse: "Warehouse",
  serviceCenter: "Service Center",
} as const;

export type SapWarehouseType =
  (typeof SAP_WAREHOUSE_TYPES)[keyof typeof SAP_WAREHOUSE_TYPES];

/**
 * A `$filter` restricting a `Warehouses` walk to one type, for the syncs that want only
 * their own rows. SAP's OData has no `tolower`/`trim` (it answers 400, "Not supported
 * function"), which is another reason the comparison is exact.
 */
export function sapWarehouseTypeFilter(type: SapWarehouseType): string {
  return `${SAP_WAREHOUSE_TYPE_FIELD} eq '${type}'`;
}

/**
 * What a SAP warehouse row says it is.
 *
 * `raw` is the field as SAP holds it, trimmed, and `null` when it is unset — the Service
 * Layer returns `""` for an unset string on some fields and `null` on others, and neither
 * is a type. `type` is that value once matched against the list, so a row SAP somehow
 * returned with an off-list value reads as `{ raw: "…", type: null }` and can be reported
 * as unrecognised rather than mistaken for untyped.
 */
export function sapWarehouseType(row: Record<string, unknown>): {
  raw: string | null;
  type: SapWarehouseType | null;
} {
  const value = row[SAP_WAREHOUSE_TYPE_FIELD];
  const text = value === null || value === undefined ? "" : String(value).trim();
  if (text === "") return { raw: null, type: null };

  const type = Object.values(SAP_WAREHOUSE_TYPES).find((known) => known === text);
  return { raw: text, type: type ?? null };
}
