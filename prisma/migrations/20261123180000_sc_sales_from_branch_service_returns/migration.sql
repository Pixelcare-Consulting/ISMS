-- Service center sales now come only from branch sales: a branch Service Return /
-- Replacement makes a copy of the branch sale at the chosen service center, and the SC
-- request runs on that copy. The copy points back at its branch sale.
-- Copies keep the branch transaction number, so it is no longer unique per service center.

DROP INDEX "service_center_sales_transactions_tenant_id_service_center__key";

ALTER TABLE "service_center_sales_transactions" ADD COLUMN "source_branch_sale_id" TEXT;

CREATE UNIQUE INDEX "service_center_sales_transactions_source_branch_sale_id_key" ON "service_center_sales_transactions"("source_branch_sale_id");

ALTER TABLE "service_center_sales_transactions" ADD CONSTRAINT "service_center_sales_transactions_source_branch_sale_id_fkey" FOREIGN KEY ("source_branch_sale_id") REFERENCES "branch_sales_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
