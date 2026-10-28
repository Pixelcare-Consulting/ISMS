/**
 * What a targeted serial sync can be narrowed to. Values are what the API carries;
 * `SERIAL_SYNC_TARGET_LABELS` is the only place they are turned into UI copy.
 */
export const SERIAL_SYNC_TARGET_KINDS = [
  "SERIAL",
  "MODEL",
  "BRAND",
  "BRANCH",
  "WAREHOUSE",
] as const;

export type SerialSyncTargetKind = (typeof SERIAL_SYNC_TARGET_KINDS)[number];

export const SERIAL_SYNC_TARGET_LABELS: Record<SerialSyncTargetKind, string> = {
  SERIAL: "Serial Numbers",
  MODEL: "Models",
  BRAND: "Brands",
  BRANCH: "Branches",
  WAREHOUSE: "Warehouses",
};

/**
 * Most values one targeted sync takes. Serials are pasted, so the cap is a sanity limit
 * on a paste rather than a cost limit: the engine segments any number of keys.
 */
export const SERIAL_SYNC_TARGET_MAX_VALUES = 1000;
