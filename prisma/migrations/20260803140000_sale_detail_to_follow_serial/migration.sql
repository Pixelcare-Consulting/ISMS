-- Make detail serial optional so sales can save TO-FOLLOW lines
-- without linking a real serial_numbers row yet.
ALTER TABLE "branch_sales_transaction_details"
  DROP CONSTRAINT IF EXISTS "branch_sales_transaction_details_serial_number_id_fkey";

ALTER TABLE "branch_sales_transaction_details"
  ALTER COLUMN "serial_number_id" DROP NOT NULL;

ALTER TABLE "branch_sales_transaction_details"
  ADD CONSTRAINT "branch_sales_transaction_details_serial_number_id_fkey"
  FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
