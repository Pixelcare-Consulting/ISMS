/**
 * The SAP warehouse-type UDF (`OWHS.U_Warehouse_Type`), which decides what an ISMS
 * warehouse row actually *is*.
 *
 * SAP keeps every physical location in one place — `Warehouses` — and distinguishes a
 * retail branch from a stocking warehouse from a service centre only by this field. ISMS
 * models those as three separate tables, so the type is the routing key: one Service
 * Layer entity feeds `branches`, `warehouses` and `service_centers`.
 *
 * Each of the three syncs filters on its own type server-side, so the split happens in
 * SAP and a row reaches exactly one of them. Nothing here parses the field back out of a
 * row: the filter is the whole mechanism.
 *
 * Confirmed against the live company database (`scripts/check-sap-warehouse-type-udf.mjs`):
 * the UDF is a *list* field with exactly the three values below, so SAP itself rejects
 * anything else and the values can be compared exactly — no casing or whitespace
 * tolerance is needed, and none is applied. What the field *is* routinely is null: it was
 * added after the warehouses were, so most rows are still untyped and reach no sync at all
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
