/** Flat serial list (one row per serial) sort fields. */
export type FlatSerialListSort =
  | "serial"
  | "model"
  | "branch"
  | "status"
  | "record"
  | "lastSync";

export type FlatSerialListSortDir = "asc" | "desc";

/** First-load / Clear flat-list order (Branch A→Z, then ISMS status, then newest sync). */
export const FLAT_SERIAL_DEFAULT_SORT: FlatSerialListSort = "branch";
export const FLAT_SERIAL_DEFAULT_SORT_DIR: FlatSerialListSortDir = "asc";
