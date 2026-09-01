/**
 * Shared result contract for the one-way SAP → ISMS master-data syncs (branches,
 * warehouses, dealers, models, serial numbers).
 *
 * Every sync is additive: it creates records SAP knows about and patches the fields SAP
 * owns, matched on the record's SAP code. None of them delete or deactivate anything — a
 * record SAP stops returning is simply left alone.
 *
 * Lives in the sap feature rather than per-module so the engine, the server actions and
 * the shared sync button all read from one definition.
 */

/**
 * A group of rows the sync could not apply, and why.
 *
 * Grouped rather than listed per row: these syncs run over entities of any size, and at
 * four million rows a row-by-row list is unreadable while a systemic problem — one bad
 * mapping, one missing catalogue — reports as a single line with a count.
 */
export interface SapSyncSkip {
  /** What went wrong, e.g. "Item is not in ISMS yet". */
  reason: string;
  /** How many rows hit it. */
  count: number;
  /** A capped sample of the SAP codes involved, so the user can go look at one. */
  examples: string[];
}

export interface SapSyncResult {
  /** Rows read from SAP in this run. */
  fetched: number;
  created: number;
  updated: number;
  /** Matched a record that already agreed with SAP on every synced field. */
  unchanged: number;
  skipped: SapSyncSkip[];

  /**
   * Whether the entity was read all the way through in this run.
   *
   * False means the run stopped on its time budget with its place saved — the sync is
   * unfinished, not failed, and continues on the next call. Small entities always come
   * back true.
   */
  caughtUp: boolean;
  /** Rows read in the current pass, including earlier runs of it. */
  passRows: number;
  /** SAP's row count for the entity, or null if it could not be measured. */
  totalAtSource: number | null;
}
