-- Optional per-unit DEF flag on a reject request; the unit returns to the warehouse as DEF.
ALTER TABLE "delivery_return_lines" ADD COLUMN "mark_defective" BOOLEAN NOT NULL DEFAULT false;
