-- Order workflow fields, CBM, planogram effective date
ALTER TABLE "branch_orders" ADD COLUMN "brand_id" TEXT;
ALTER TABLE "branch_orders" ADD COLUMN "spa_remarks" TEXT;
ALTER TABLE "branch_orders" ADD COLUMN "delivery_due_date" TIMESTAMP(3);
ALTER TABLE "branch_orders" ADD COLUMN "processed_at" TIMESTAMP(3);

ALTER TABLE "branch_order_details" ADD COLUMN "approved_qty" INTEGER;

ALTER TABLE "product_models" ADD COLUMN "cbm" DECIMAL(10,4);

ALTER TABLE "branch_planograms" ADD COLUMN "effective_from" TIMESTAMP(3);

ALTER TABLE "branch_orders" ADD CONSTRAINT "branch_orders_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "branch_orders_tenant_id_processed_at_idx" ON "branch_orders"("tenant_id", "processed_at");
