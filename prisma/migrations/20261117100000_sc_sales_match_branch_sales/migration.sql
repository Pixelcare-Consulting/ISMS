-- Service center sales now work like branch Sales Transactions: one header with many
-- detail lines (serial or TO-FOLLOW), the same header fields, and the transaction number
-- unique per service center. Stock still comes from the SC ledger.

-- The single serial moves from the header to the new detail lines. No SC sale existed when
-- this was written; stop instead of dropping serials if one has been recorded since.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "service_center_sales_transactions") THEN
    RAISE EXCEPTION 'service_center_sales_transactions has rows: move their serial_number_id into service_center_sales_transaction_details before applying this migration';
  END IF;
END $$;

ALTER TABLE "service_center_sales_transactions" DROP CONSTRAINT "service_center_sales_transactions_serial_number_id_fkey";

-- Unique per service center, like branch sales (unique per branch).
DROP INDEX "service_center_sales_transactions_tenant_id_transaction_no_key";

ALTER TABLE "service_center_sales_transactions" DROP COLUMN "serial_number_id",
ADD COLUMN "contact_no" TEXT,
ADD COLUMN "created_by_id" TEXT,
ADD COLUMN "info_slip_vso_rr_released" TEXT,
ADD COLUMN "model_price" DECIMAL(12,2),
ADD COLUMN "proof" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "rr_receive_deliver" TEXT;

CREATE TABLE "service_center_sales_transaction_details" (
    "id" TEXT NOT NULL,
    "sales_id" TEXT NOT NULL,
    "package_type_id" TEXT,
    "brand_id" TEXT,
    "promo_type_id" TEXT,
    "model_id" TEXT,
    "serial_number_id" TEXT,
    "status_code_id" TEXT,
    "delivery_no" TEXT,
    "delivery_date" TIMESTAMP(3),
    "model_price" DECIMAL(12,2),
    "sale_amount" DECIMAL(12,2),
    "amount" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_center_sales_transaction_details_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_center_sales_transaction_details_sales_id_idx" ON "service_center_sales_transaction_details"("sales_id");

CREATE INDEX "service_center_sales_transaction_details_serial_number_id_idx" ON "service_center_sales_transaction_details"("serial_number_id");

CREATE INDEX "service_center_sales_transaction_details_status_code_id_idx" ON "service_center_sales_transaction_details"("status_code_id");

CREATE INDEX "service_center_sales_transactions_tenant_id_atr_status_idx" ON "service_center_sales_transactions"("tenant_id", "atr_status");

CREATE INDEX "service_center_sales_transactions_created_by_id_idx" ON "service_center_sales_transactions"("created_by_id");

CREATE UNIQUE INDEX "service_center_sales_transactions_tenant_id_service_center__key" ON "service_center_sales_transactions"("tenant_id", "service_center_id", "transaction_no");

ALTER TABLE "service_center_sales_transactions" ADD CONSTRAINT "service_center_sales_transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_center_sales_transaction_details" ADD CONSTRAINT "service_center_sales_transaction_details_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "service_center_sales_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_center_sales_transaction_details" ADD CONSTRAINT "service_center_sales_transaction_details_package_type_id_fkey" FOREIGN KEY ("package_type_id") REFERENCES "package_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_center_sales_transaction_details" ADD CONSTRAINT "service_center_sales_transaction_details_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_center_sales_transaction_details" ADD CONSTRAINT "service_center_sales_transaction_details_promo_type_id_fkey" FOREIGN KEY ("promo_type_id") REFERENCES "promo_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_center_sales_transaction_details" ADD CONSTRAINT "service_center_sales_transaction_details_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_center_sales_transaction_details" ADD CONSTRAINT "service_center_sales_transaction_details_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_center_sales_transaction_details" ADD CONSTRAINT "service_center_sales_transaction_details_status_code_id_fkey" FOREIGN KEY ("status_code_id") REFERENCES "reason_status_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Header edit on SC sales gets its own permission, like `sales.update` on branch sales.
-- Every role that can edit branch sale headers today can edit SC sale headers.
INSERT INTO "permissions" ("id", "slug", "name", "created_at", "updated_at")
VALUES (gen_random_uuid()::text, 'service_centers.sales.update', 'Edit service center sale headers', NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, granted."role_id", sc_update."id", NOW()
FROM (
  SELECT DISTINCT existing."role_id"
  FROM "role_permissions" AS existing
  INNER JOIN "permissions" AS gate
    ON gate."id" = existing."permission_id"
    AND gate."slug" = 'sales.update'
) AS granted
CROSS JOIN "permissions" AS sc_update
WHERE sc_update."slug" = 'service_centers.sales.update'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
