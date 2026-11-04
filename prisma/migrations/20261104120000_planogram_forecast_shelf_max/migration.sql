-- Shelf max is now calculated on forecast upload. Today's values are kept for traceability.
ALTER TABLE "branch_planograms"
  ADD COLUMN "max_qty_calc" JSONB,
  ADD COLUMN "max_qty_edited_at" TIMESTAMP(3),
  ADD COLUMN "legacy_max_qty" INTEGER;

UPDATE "branch_planograms" SET "legacy_max_qty" = "max_qty";
