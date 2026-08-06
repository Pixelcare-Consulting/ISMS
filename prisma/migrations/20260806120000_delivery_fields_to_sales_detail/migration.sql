-- Move deliveryNo/deliveryDate from BranchSalesTransaction (header) to
-- BranchSalesTransactionDetail (line item). Preserves existing header values
-- by copying them onto every detail row of that sale before dropping the
-- header columns.

ALTER TABLE "branch_sales_transaction_details"
  ADD COLUMN IF NOT EXISTS "delivery_no" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery_date" TIMESTAMP(3);

UPDATE "branch_sales_transaction_details" d
SET "delivery_no" = s."delivery_no",
    "delivery_date" = s."delivery_date"
FROM "branch_sales_transactions" s
WHERE d."sales_id" = s."id"
  AND (s."delivery_no" IS NOT NULL OR s."delivery_date" IS NOT NULL);

ALTER TABLE "branch_sales_transactions"
  DROP COLUMN IF EXISTS "delivery_no",
  DROP COLUMN IF EXISTS "delivery_date";
