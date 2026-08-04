-- Official Sales staging: dealer template columns (DEALER, BRAND, ITEM/MODEL, SALE AMOUNT, PACKAGE).
ALTER TABLE "official_sales_import_rows"
  ADD COLUMN IF NOT EXISTS "dealer" TEXT,
  ADD COLUMN IF NOT EXISTS "brand" TEXT,
  ADD COLUMN IF NOT EXISTS "item_model" TEXT,
  ADD COLUMN IF NOT EXISTS "sale_amount" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "package_name" TEXT;
