/**
 * Shared contract for one-way SAP → ISMS master-data syncs (branches, warehouses, …).
 *
 * Every sync is additive: it creates records SAP knows about and patches the fields SAP
 * owns, matched on the record's SAP code. None of them delete or deactivate a record that
 * is missing from SAP — those are only counted in `notInSap` so an admin can decide.
 *
 * Lives in the sap feature rather than per-module so the server services and the shared
 * sync button all read from one definition.
 */

/** A SAP record the sync refused to apply, with the reason shown back to the user. */
export interface SapMasterSyncSkip {
  sapCode: string | null;
  name: string | null;
  reason: string;
}

export interface SapMasterSyncResult {
  /** Rows returned by SAP, before validation. */
  fetched: number;
  created: number;
  updated: number;
  /** Matched a record that already agreed with SAP on every synced field. */
  unchanged: number;
  skipped: SapMasterSyncSkip[];
  /** ISMS records with no matching SAP record — reported, never modified. */
  notInSap: number;
}
