-- Official Sales staging: Branch Sold + Action (Accounting columns; display/storage only).
ALTER TABLE "official_sales_import_rows"
  ADD COLUMN IF NOT EXISTS "branch_sold" TEXT,
  ADD COLUMN IF NOT EXISTS "action" TEXT;
