-- Official Sales staging: split the sales-invoice pair out of the DR pair.
-- DATE and SI/TRANS NO. used to collapse into dr_date/dr_no (the parser preferred
-- them over DR DATE / DR NO.), so a row carrying both documents lost the DR values.
-- They now land in their own columns; dr_date/dr_no mean the delivery receipt only.
--
-- No backfill: existing rows cannot be told apart — a dr_no may hold either an SI
-- number or a real DR number — so copying would fabricate data. Processing stays
-- correct for legacy rows via the siDate ?? drDate fallback in processRows().
ALTER TABLE "official_sales_import_rows"
  ADD COLUMN IF NOT EXISTS "si_date" DATE,
  ADD COLUMN IF NOT EXISTS "si_no" TEXT;
