-- Link branch deliveries to approved branch orders (Process Flow II sync)
ALTER TABLE "branch_deliveries" ADD COLUMN "order_id" TEXT;

CREATE INDEX "branch_deliveries_tenant_id_order_id_idx" ON "branch_deliveries"("tenant_id", "order_id");

ALTER TABLE "branch_deliveries" ADD CONSTRAINT "branch_deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "branch_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
