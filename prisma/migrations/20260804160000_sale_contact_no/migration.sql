-- Optional customer contact number on sales transactions
ALTER TABLE "branch_sales_transactions"
  ADD COLUMN IF NOT EXISTS "contact_no" TEXT;
