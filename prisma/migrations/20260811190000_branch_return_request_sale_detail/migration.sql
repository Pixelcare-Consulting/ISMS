-- Target a single sale line for multi-SN package returns

ALTER TABLE "branch_return_requests"
  ADD COLUMN IF NOT EXISTS "sale_detail_id" TEXT;

CREATE INDEX IF NOT EXISTS "branch_return_requests_sale_detail_id_idx"
  ON "branch_return_requests"("sale_detail_id");

ALTER TABLE "branch_return_requests"
  DROP CONSTRAINT IF EXISTS "branch_return_requests_sale_detail_id_fkey";

ALTER TABLE "branch_return_requests"
  ADD CONSTRAINT "branch_return_requests_sale_detail_id_fkey"
  FOREIGN KEY ("sale_detail_id") REFERENCES "branch_sales_transaction_details"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
