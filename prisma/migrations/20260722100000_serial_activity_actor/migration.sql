-- AlterTable
ALTER TABLE "serial_numbers" ADD COLUMN "created_by_id" TEXT;

-- AlterTable
ALTER TABLE "branch_transfers" ADD COLUMN "created_by_id" TEXT;

-- AlterTable
ALTER TABLE "branch_sales_transactions" ADD COLUMN "created_by_id" TEXT;

-- CreateIndex
CREATE INDEX "serial_numbers_created_by_id_idx" ON "serial_numbers"("created_by_id");

-- CreateIndex
CREATE INDEX "branch_transfers_created_by_id_idx" ON "branch_transfers"("created_by_id");

-- CreateIndex
CREATE INDEX "branch_sales_transactions_created_by_id_idx" ON "branch_sales_transactions"("created_by_id");

-- AddForeignKey
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_transfers" ADD CONSTRAINT "branch_transfers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_sales_transactions" ADD CONSTRAINT "branch_sales_transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
