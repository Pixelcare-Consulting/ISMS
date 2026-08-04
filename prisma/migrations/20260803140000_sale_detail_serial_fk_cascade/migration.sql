-- Align branch_sales_transaction_details.serial_number_id with Prisma schema:
-- required String + ON DELETE CASCADE (DB had drifted to nullable + SET NULL).

-- Orphan rows left behind when serials were deleted under SET NULL cannot be restored.
DELETE FROM "branch_sales_transaction_details"
WHERE "serial_number_id" IS NULL;

ALTER TABLE "branch_sales_transaction_details"
  DROP CONSTRAINT IF EXISTS "branch_sales_transaction_details_serial_number_id_fkey";

ALTER TABLE "branch_sales_transaction_details"
  ALTER COLUMN "serial_number_id" SET NOT NULL;

ALTER TABLE "branch_sales_transaction_details"
  ADD CONSTRAINT "branch_sales_transaction_details_serial_number_id_fkey"
  FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
