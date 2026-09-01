-- Rework the SAP sync cursor from a one-way watermark into a repeating pass.
--
-- The old cursor only ever read forward (`DocEntry gt last_key`), so a row edited in SAP
-- below the watermark could never be seen again. It now tracks position within a pass
-- that restarts on completion, which is the only way to pick up SAP-side edits:
-- SerialNumberDetails exposes no change timestamp to filter on.

-- The missing-parent rewind existed only to rescue rows the watermark had moved past.
-- A repeating pass re-reads them on its own, so the bookkeeping goes.
ALTER TABLE "sap_sync_cursors"
  DROP COLUMN IF EXISTS "pending_from_key",
  DROP COLUMN IF EXISTS "pending_parent_count";

ALTER TABLE "sap_sync_cursors"
  -- Rows read so far in the current pass; NULL start_at means no pass is in progress,
  -- which is what makes the next run begin a fresh one.
  ADD COLUMN IF NOT EXISTS "pass_rows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pass_started_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_completed_at" TIMESTAMP(3);

-- `caught_up_at` meant "the read reached the end of the entity" — the same thing
-- `last_completed_at` now records, so carry it across rather than losing the history.
UPDATE "sap_sync_cursors"
  SET "last_completed_at" = "caught_up_at"
  WHERE "caught_up_at" IS NOT NULL;

ALTER TABLE "sap_sync_cursors" DROP COLUMN IF EXISTS "caught_up_at";

-- last_key becomes text so one column serves both numeric keys (OSRN.DocEntry) and string
-- keys (ItemCode, CardCode, WarehouseCode). Dropped and re-added rather than cast: every
-- cursor is restarting its pass regardless, and the stored integers carry no meaning for
-- the entities that key on text.
ALTER TABLE "sap_sync_cursors" DROP COLUMN IF EXISTS "last_key";
ALTER TABLE "sap_sync_cursors" ADD COLUMN IF NOT EXISTS "last_key" TEXT;
