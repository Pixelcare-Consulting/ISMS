-- DropIndex
DROP INDEX "branch_sales_transactions_tenant_id_transaction_no_key";

-- CreateIndex
CREATE UNIQUE INDEX "branch_sales_transactions_tenant_id_branch_id_transaction_no_key" ON "branch_sales_transactions"("tenant_id", "branch_id", "transaction_no");
