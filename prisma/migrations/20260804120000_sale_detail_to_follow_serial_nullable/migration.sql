-- TO-FOLLOW sales leave detail.serial_number_id null until a real SN is assigned.
-- A later same-day migration had re-applied NOT NULL + ON DELETE CASCADE; restore
-- nullable + SET NULL to match Prisma schema.

ALTER TABLE "branch_sales_transaction_details"
  DROP CONSTRAINT IF EXISTS "branch_sales_transaction_details_serial_number_id_fkey";

ALTER TABLE "branch_sales_transaction_details"
  ALTER COLUMN "serial_number_id" DROP NOT NULL;

ALTER TABLE "branch_sales_transaction_details"
  ADD CONSTRAINT "branch_sales_transaction_details_serial_number_id_fkey"
  FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
