-- A location code is unique within its warehouse, ignoring case and surrounding spaces
-- ("a1" and "A1 " are the same bin). The app checks this before saving; this index closes
-- the race where two people add the same code at the same moment. Names may repeat.
-- Expression index, so it lives in SQL only (like delivery_return_open_uq).
-- Checked before writing: no existing duplicates (2026-10-28).
CREATE UNIQUE INDEX IF NOT EXISTS "warehouse_locations_code_ci_uq"
  ON "warehouse_locations" ("warehouse_id", upper(btrim("code")));
