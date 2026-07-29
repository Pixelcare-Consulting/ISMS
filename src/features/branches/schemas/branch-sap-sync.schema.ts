/**
 * Contract for the branch → SAP master-data sync.
 *
 * The sync is one-way (SAP → ISMS) and additive: it creates branches SAP knows about
 * and patches the name/status of ones it already has, matched on `sap_code`. It never
 * deletes or deactivates a branch that is missing from SAP — those are only counted
 * in `notInSap` so an admin can decide what to do with them.
 *
 * Shared by the server sync service and the client button so the result summary has
 * one definition.
 */

/** A SAP record the sync refused to apply, with the reason shown back to the user. */
export interface BranchSapSyncSkip {
  sapCode: string | null;
  name: string | null;
  reason: string;
}

export interface BranchSapSyncResult {
  /** Rows returned by SAP, before validation. */
  fetched: number;
  created: number;
  updated: number;
  /** Matched a branch that already had the same name and status. */
  unchanged: number;
  skipped: BranchSapSyncSkip[];
  /** ISMS branches with no matching SAP record — reported, never modified. */
  notInSap: number;
}
