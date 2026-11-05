-- Max Qty is now calculated on forecast upload and lives in its own column.
-- The old Shelf max stays in "max_qty" with its values untouched, for traceability. The app
-- no longer reads or writes that column, so it must allow null on rows created from now on.
ALTER TABLE "branch_planograms"
  ADD COLUMN "calculated_max_qty" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "max_qty_calc" JSONB,
  ADD COLUMN "max_qty_edited_at" TIMESTAMP(3),
  ALTER COLUMN "max_qty" DROP NOT NULL,
  ALTER COLUMN "max_qty" DROP DEFAULT;
