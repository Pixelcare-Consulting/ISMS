/**
 * What one SAP → ISMS master-data sync has to say about itself.
 *
 * The engine (`sap-sync-engine.ts`) owns everything the syncs have in common: paging,
 * resuming, budgets, locking, skip reporting, the audit record. A descriptor supplies the
 * three things that genuinely differ per entity — which Service Layer entity to read, how
 * to read one of its rows, and how to write a page of them — and nothing else.
 *
 * Adding a sync means writing one of these and registering it; it should not mean writing
 * another sync loop.
 */

/** Whether the entity's key is an OData number (`DocEntry`) or string (`ItemCode`). */
export type SapSyncKeyKind = "string" | "number";

/** A SAP row the sync refused, with the reason shown back to the user. */
export interface SapSyncSkipOutcome {
  /**
   * Grouped on: identical reasons are counted together, so this should name the problem
   * ("Item is not in ISMS") and never carry the row's own values.
   */
  skip: string;
  /** The offending row's code, kept as an example under its reason. */
  example?: string | null;
}

export type SapSyncParseOutcome<TRecord> = { record: TRecord } | SapSyncSkipOutcome;

/** What writing one page did. Rows that could not be written report as skips. */
export interface SapSyncApplyResult {
  created: number;
  updated: number;
  /** Matched a record that already agreed with SAP on every synced field. */
  unchanged: number;
  failures: { reason: string; example?: string | null }[];
}

export interface SapSyncEntity<TRecord = unknown, TContext = unknown> {
  /** Stable id for the lock, the UI sync key and the cron's registry, e.g. `"dealer"`. */
  key: string;
  /** Singular + plural for user-facing copy, e.g. `{ one: "dealer", many: "dealers" }`. */
  noun: { one: string; many: string };

  /** Service Layer entity set, e.g. `"BusinessPartners"`. */
  entity: string;
  /** `$select` — read only the fields the sync maps. */
  select: string;
  /**
   * The entity's key. Paging orders by it and resumes after it, so it must be unique and
   * stably ordered; anything else silently drops or repeats rows across runs.
   */
  keyField: string;
  keyKind: SapSyncKeyKind;
  /** Standing `$filter` for rows ISMS cares about, e.g. `"CardType eq 'cCustomer'"`. */
  filter?: string;

  audit: { action: string; entityType: string };

  /**
   * Load whatever every row needs to be interpreted, once per run — typically a lookup
   * of ISMS records the rows reference. Only for data small enough to hold for a whole
   * run: the point of the engine is that a page is the largest thing in memory.
   */
  prepare?(tenantId: string): Promise<TContext>;

  /** Map one SAP row to a record to apply, or say why it cannot be applied. */
  parse(row: Record<string, unknown>, context: TContext): SapSyncParseOutcome<TRecord>;

  /**
   * Write one page. Implementations look up only the keys in `records` — never a whole
   * table — so memory stays flat however large the entity is.
   */
  applyPage(tenantId: string, records: TRecord[]): Promise<SapSyncApplyResult>;
}
