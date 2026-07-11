-- Excel Schema gap align: sales/return FKs, branch ledger tables, SC ops mirror, AOR polish

-- CreateEnum
CREATE TYPE "SerialHistoryTxnType" AS ENUM (
  'grpo',
  'delivery',
  'backload',
  'inv_acknowledgement',
  'inv_status_update',
  'transfer',
  'pullout',
  'sales',
  'reserved_sold',
  'return',
  'replacement',
  'pcount'
);

-- ========== Phase 1a: existing model field / FK parity ==========

ALTER TABLE "product_models" ADD COLUMN IF NOT EXISTS "description" TEXT;

ALTER TABLE "service_centers"
  ADD COLUMN IF NOT EXISTS "dealer_type_id" TEXT,
  ADD COLUMN IF NOT EXISTS "dealer_area_id" TEXT,
  ADD COLUMN IF NOT EXISTS "mode_of_payment_id" TEXT;

ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "mode_of_payment_id" TEXT;

ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "branch_status_type_id" TEXT;

ALTER TABLE "aors"
  ADD COLUMN IF NOT EXISTS "name" TEXT,
  ADD COLUMN IF NOT EXISTS "warehouse_location_id" TEXT,
  ADD COLUMN IF NOT EXISTS "service_center_id" TEXT,
  ADD COLUMN IF NOT EXISTS "service_center_location_id" TEXT,
  ADD COLUMN IF NOT EXISTS "status" "LookupRecordStatus" NOT NULL DEFAULT 'active';

ALTER TABLE "branch_order_details"
  ADD COLUMN IF NOT EXISTS "remarks" TEXT,
  ADD COLUMN IF NOT EXISTS "amount" DECIMAL(12,2);

ALTER TABLE "branch_pullouts"
  ADD COLUMN IF NOT EXISTS "warehouse_location_id" TEXT,
  ADD COLUMN IF NOT EXISTS "waybill_no" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "actual_scheduled_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduled_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;

ALTER TABLE "branch_sales_transactions"
  ADD COLUMN IF NOT EXISTS "payment_type_id" TEXT,
  ADD COLUMN IF NOT EXISTS "sale_type_id" TEXT,
  ADD COLUMN IF NOT EXISTS "promo_type_id" TEXT,
  ADD COLUMN IF NOT EXISTS "customer_delivery_method_id" TEXT,
  ADD COLUMN IF NOT EXISTS "transaction_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "customer_name" TEXT,
  ADD COLUMN IF NOT EXISTS "si_trans" TEXT,
  ADD COLUMN IF NOT EXISTS "info_slip_vso_rr_released" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "rr_receive_deliver" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "proof" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery_no" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "model_price" DECIMAL(12,2);

ALTER TABLE "branch_return_requests"
  ADD COLUMN IF NOT EXISTS "problem_description_id" TEXT,
  ADD COLUMN IF NOT EXISTS "document_type_id" TEXT,
  ADD COLUMN IF NOT EXISTS "return_type_id" TEXT,
  ADD COLUMN IF NOT EXISTS "service_center_location_id" TEXT,
  ADD COLUMN IF NOT EXISTS "dealer_rs_no" TEXT,
  ADD COLUMN IF NOT EXISTS "service_approval_code" TEXT,
  ADD COLUMN IF NOT EXISTS "actual_date_returned" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "accepted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "accepted_by_id" TEXT;

-- FKs for altered tables
ALTER TABLE "service_centers" ADD CONSTRAINT "service_centers_dealer_type_id_fkey" FOREIGN KEY ("dealer_type_id") REFERENCES "dealer_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_centers" ADD CONSTRAINT "service_centers_dealer_area_id_fkey" FOREIGN KEY ("dealer_area_id") REFERENCES "dealer_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_centers" ADD CONSTRAINT "service_centers_mode_of_payment_id_fkey" FOREIGN KEY ("mode_of_payment_id") REFERENCES "mode_of_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_mode_of_payment_id_fkey" FOREIGN KEY ("mode_of_payment_id") REFERENCES "mode_of_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "branches" ADD CONSTRAINT "branches_branch_status_type_id_fkey" FOREIGN KEY ("branch_status_type_id") REFERENCES "branch_status_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "aors" ADD CONSTRAINT "aors_warehouse_location_id_fkey" FOREIGN KEY ("warehouse_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "aors" ADD CONSTRAINT "aors_service_center_id_fkey" FOREIGN KEY ("service_center_id") REFERENCES "service_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "aors" ADD CONSTRAINT "aors_service_center_location_id_fkey" FOREIGN KEY ("service_center_location_id") REFERENCES "service_center_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "branch_pullouts" ADD CONSTRAINT "branch_pullouts_warehouse_location_id_fkey" FOREIGN KEY ("warehouse_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branch_pullouts" ADD CONSTRAINT "branch_pullouts_scheduled_by_id_fkey" FOREIGN KEY ("scheduled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branch_pullouts" ADD CONSTRAINT "branch_pullouts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "branch_sales_transactions" ADD CONSTRAINT "branch_sales_transactions_payment_type_id_fkey" FOREIGN KEY ("payment_type_id") REFERENCES "payment_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branch_sales_transactions" ADD CONSTRAINT "branch_sales_transactions_sale_type_id_fkey" FOREIGN KEY ("sale_type_id") REFERENCES "sale_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branch_sales_transactions" ADD CONSTRAINT "branch_sales_transactions_promo_type_id_fkey" FOREIGN KEY ("promo_type_id") REFERENCES "promo_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branch_sales_transactions" ADD CONSTRAINT "branch_sales_transactions_customer_delivery_method_id_fkey" FOREIGN KEY ("customer_delivery_method_id") REFERENCES "customer_delivery_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "branch_return_requests" ADD CONSTRAINT "branch_return_requests_problem_description_id_fkey" FOREIGN KEY ("problem_description_id") REFERENCES "problem_descriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branch_return_requests" ADD CONSTRAINT "branch_return_requests_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branch_return_requests" ADD CONSTRAINT "branch_return_requests_return_type_id_fkey" FOREIGN KEY ("return_type_id") REFERENCES "return_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branch_return_requests" ADD CONSTRAINT "branch_return_requests_service_center_location_id_fkey" FOREIGN KEY ("service_center_location_id") REFERENCES "service_center_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branch_return_requests" ADD CONSTRAINT "branch_return_requests_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ========== Phase 1b: new branch / warehouse tables ==========

CREATE TABLE "branch_sales_transaction_details" (
    "id" TEXT NOT NULL,
    "sales_id" TEXT NOT NULL,
    "model_id" TEXT,
    "serial_number_id" TEXT NOT NULL,
    "model_price" DECIMAL(12,2),
    "sale_amount" DECIMAL(12,2),
    "amount" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "branch_sales_transaction_details_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_replacements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "replacement_no" TEXT NOT NULL,
    "original_serial_number_id" TEXT,
    "original_model_price" DECIMAL(12,2),
    "original_invoice_date" TIMESTAMP(3),
    "original_invoice_no" TEXT,
    "replacement_serial_number_id" TEXT,
    "replacement_dealer_id" TEXT,
    "replacement_branch_id" TEXT,
    "replacement_amount" DECIMAL(12,2),
    "replacement_model_price" DECIMAL(12,2),
    "replacement_invoice_date" TIMESTAMP(3),
    "replacement_invoice_no" TEXT,
    "transacted_by_id" TEXT,
    "transacted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sales_replacements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "branch_backloads" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "delivery_id" TEXT,
    "serial_number_id" TEXT NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "branch_backloads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "branch_transfer_approval_levels" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "role_slug" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "rejected_at" TIMESTAMP(3),
    "comment" TEXT,
    CONSTRAINT "branch_transfer_approval_levels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "branch_pullout_approval_levels" (
    "id" TEXT NOT NULL,
    "pullout_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "role_slug" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "rejected_at" TIMESTAMP(3),
    "comment" TEXT,
    CONSTRAINT "branch_pullout_approval_levels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "warehouse_inventories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "serial_number_id" TEXT NOT NULL,
    "warehouse_location_id" TEXT NOT NULL,
    "system_status" TEXT,
    "system_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "warehouse_inventories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "serial_number_histories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "serial_number_id" TEXT NOT NULL,
    "txn_type" "SerialHistoryTxnType" NOT NULL,
    "details" TEXT,
    "status" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "serial_number_histories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "branch_quotas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "quota_date" DATE NOT NULL,
    "quota_amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "branch_quotas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "branch_delivery_lines" (
    "id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "serial_number_id" TEXT NOT NULL,
    "warehouse_location_from_id" TEXT,
    CONSTRAINT "branch_delivery_lines_pkey" PRIMARY KEY ("id")
);

-- ========== Phase 2: Service Center ops mirror ==========

CREATE TABLE "service_center_inventories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "service_center_id" TEXT NOT NULL,
    "service_center_location_id" TEXT NOT NULL,
    "serial_number_id" TEXT NOT NULL,
    "status_code_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_center_inventories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_center_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "service_center_id" TEXT NOT NULL,
    "service_center_location_id" TEXT,
    "brand_id" TEXT,
    "package_type_id" TEXT,
    "order_type" "BranchOrderType" NOT NULL,
    "status" "BranchOrderStatus" NOT NULL DEFAULT 'pending_tl',
    "order_number" TEXT NOT NULL,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_center_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_center_order_details" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "approved_qty" INTEGER,
    "remarks" TEXT,
    "amount" DECIMAL(12,2),
    CONSTRAINT "service_center_order_details_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_center_order_approval_levels" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "role_slug" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "rejected_at" TIMESTAMP(3),
    "comment" TEXT,
    CONSTRAINT "service_center_order_approval_levels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_center_deliveries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "service_center_id" TEXT NOT NULL,
    "service_center_location_id" TEXT,
    "order_id" TEXT,
    "delivery_no" TEXT NOT NULL,
    "status_code_id" TEXT,
    "due_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_center_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_backloads" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "service_center_id" TEXT,
    "service_center_location_id" TEXT,
    "delivery_id" TEXT,
    "serial_number_id" TEXT NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_backloads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_center_sales_transactions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "service_center_id" TEXT NOT NULL,
    "service_center_location_id" TEXT,
    "serial_number_id" TEXT,
    "package_type_id" TEXT,
    "payment_type_id" TEXT,
    "sale_type_id" TEXT,
    "promo_type_id" TEXT,
    "customer_delivery_method_id" TEXT,
    "transaction_no" TEXT NOT NULL,
    "transaction_date" TIMESTAMP(3),
    "customer_name" TEXT,
    "si_trans" TEXT,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "atr_status" "AtrStatus" NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_center_sales_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_center_pullouts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "service_center_id" TEXT NOT NULL,
    "service_center_location_id" TEXT,
    "pullout_no" TEXT NOT NULL,
    "status_code_id" TEXT,
    "reason_status_id" TEXT,
    "reason_status_code_id" TEXT,
    "waybill_no" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_center_pullouts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_center_pullout_details" (
    "id" TEXT NOT NULL,
    "pullout_id" TEXT NOT NULL,
    "serial_number_id" TEXT NOT NULL,
    CONSTRAINT "service_center_pullout_details_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_center_pullout_approval_levels" (
    "id" TEXT NOT NULL,
    "pullout_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "role_slug" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "rejected_at" TIMESTAMP(3),
    "comment" TEXT,
    CONSTRAINT "service_center_pullout_approval_levels_pkey" PRIMARY KEY ("id")
);

-- Indexes / uniques
CREATE INDEX "branch_sales_transaction_details_sales_id_idx" ON "branch_sales_transaction_details"("sales_id");
CREATE INDEX "branch_sales_transaction_details_serial_number_id_idx" ON "branch_sales_transaction_details"("serial_number_id");

CREATE UNIQUE INDEX "sales_replacements_tenant_id_replacement_no_key" ON "sales_replacements"("tenant_id", "replacement_no");
CREATE INDEX "sales_replacements_tenant_id_sale_id_idx" ON "sales_replacements"("tenant_id", "sale_id");

CREATE INDEX "branch_backloads_tenant_id_idx" ON "branch_backloads"("tenant_id");
CREATE INDEX "branch_backloads_delivery_id_idx" ON "branch_backloads"("delivery_id");

CREATE UNIQUE INDEX "branch_transfer_approval_levels_transfer_id_level_key" ON "branch_transfer_approval_levels"("transfer_id", "level");
CREATE UNIQUE INDEX "branch_pullout_approval_levels_pullout_id_level_key" ON "branch_pullout_approval_levels"("pullout_id", "level");

CREATE UNIQUE INDEX "warehouse_inventories_warehouse_location_id_serial_number_id_key" ON "warehouse_inventories"("warehouse_location_id", "serial_number_id");
CREATE INDEX "warehouse_inventories_tenant_id_idx" ON "warehouse_inventories"("tenant_id");

CREATE INDEX "serial_number_histories_tenant_id_serial_number_id_created_at_idx" ON "serial_number_histories"("tenant_id", "serial_number_id", "created_at");

CREATE UNIQUE INDEX "branch_quotas_branch_id_brand_id_quota_date_key" ON "branch_quotas"("branch_id", "brand_id", "quota_date");
CREATE INDEX "branch_quotas_tenant_id_idx" ON "branch_quotas"("tenant_id");

CREATE UNIQUE INDEX "branch_delivery_lines_delivery_id_serial_number_id_key" ON "branch_delivery_lines"("delivery_id", "serial_number_id");

CREATE UNIQUE INDEX "service_center_inventories_service_center_location_id_serial_number_id_key" ON "service_center_inventories"("service_center_location_id", "serial_number_id");
CREATE INDEX "service_center_inventories_tenant_id_service_center_id_idx" ON "service_center_inventories"("tenant_id", "service_center_id");

CREATE UNIQUE INDEX "service_center_orders_tenant_id_order_number_key" ON "service_center_orders"("tenant_id", "order_number");
CREATE INDEX "service_center_orders_tenant_id_service_center_id_status_idx" ON "service_center_orders"("tenant_id", "service_center_id", "status");

CREATE INDEX "service_center_order_details_order_id_idx" ON "service_center_order_details"("order_id");
CREATE UNIQUE INDEX "service_center_order_approval_levels_order_id_level_key" ON "service_center_order_approval_levels"("order_id", "level");

CREATE UNIQUE INDEX "service_center_deliveries_tenant_id_delivery_no_key" ON "service_center_deliveries"("tenant_id", "delivery_no");
CREATE INDEX "service_center_deliveries_tenant_id_service_center_id_idx" ON "service_center_deliveries"("tenant_id", "service_center_id");

CREATE INDEX "service_backloads_tenant_id_idx" ON "service_backloads"("tenant_id");
CREATE INDEX "service_backloads_delivery_id_idx" ON "service_backloads"("delivery_id");

CREATE UNIQUE INDEX "service_center_sales_transactions_tenant_id_transaction_no_key" ON "service_center_sales_transactions"("tenant_id", "transaction_no");
CREATE INDEX "service_center_sales_transactions_tenant_id_service_center_id_idx" ON "service_center_sales_transactions"("tenant_id", "service_center_id");

CREATE UNIQUE INDEX "service_center_pullouts_tenant_id_pullout_no_key" ON "service_center_pullouts"("tenant_id", "pullout_no");
CREATE INDEX "service_center_pullouts_tenant_id_service_center_id_idx" ON "service_center_pullouts"("tenant_id", "service_center_id");

CREATE UNIQUE INDEX "service_center_pullout_details_pullout_id_serial_number_id_key" ON "service_center_pullout_details"("pullout_id", "serial_number_id");
CREATE UNIQUE INDEX "service_center_pullout_approval_levels_pullout_id_level_key" ON "service_center_pullout_approval_levels"("pullout_id", "level");

-- Foreign keys for new tables
ALTER TABLE "branch_sales_transaction_details" ADD CONSTRAINT "branch_sales_transaction_details_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "branch_sales_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_sales_transaction_details" ADD CONSTRAINT "branch_sales_transaction_details_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branch_sales_transaction_details" ADD CONSTRAINT "branch_sales_transaction_details_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales_replacements" ADD CONSTRAINT "sales_replacements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_replacements" ADD CONSTRAINT "sales_replacements_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "branch_sales_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_replacements" ADD CONSTRAINT "sales_replacements_original_serial_number_id_fkey" FOREIGN KEY ("original_serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_replacements" ADD CONSTRAINT "sales_replacements_replacement_serial_number_id_fkey" FOREIGN KEY ("replacement_serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_replacements" ADD CONSTRAINT "sales_replacements_replacement_dealer_id_fkey" FOREIGN KEY ("replacement_dealer_id") REFERENCES "dealers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_replacements" ADD CONSTRAINT "sales_replacements_replacement_branch_id_fkey" FOREIGN KEY ("replacement_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_replacements" ADD CONSTRAINT "sales_replacements_transacted_by_id_fkey" FOREIGN KEY ("transacted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "branch_backloads" ADD CONSTRAINT "branch_backloads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_backloads" ADD CONSTRAINT "branch_backloads_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branch_backloads" ADD CONSTRAINT "branch_backloads_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "branch_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branch_backloads" ADD CONSTRAINT "branch_backloads_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_transfer_approval_levels" ADD CONSTRAINT "branch_transfer_approval_levels_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "branch_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_pullout_approval_levels" ADD CONSTRAINT "branch_pullout_approval_levels_pullout_id_fkey" FOREIGN KEY ("pullout_id") REFERENCES "branch_pullouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "warehouse_inventories" ADD CONSTRAINT "warehouse_inventories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "warehouse_inventories" ADD CONSTRAINT "warehouse_inventories_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "warehouse_inventories" ADD CONSTRAINT "warehouse_inventories_warehouse_location_id_fkey" FOREIGN KEY ("warehouse_location_id") REFERENCES "warehouse_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "serial_number_histories" ADD CONSTRAINT "serial_number_histories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "serial_number_histories" ADD CONSTRAINT "serial_number_histories_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "serial_number_histories" ADD CONSTRAINT "serial_number_histories_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "branch_quotas" ADD CONSTRAINT "branch_quotas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_quotas" ADD CONSTRAINT "branch_quotas_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_quotas" ADD CONSTRAINT "branch_quotas_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_delivery_lines" ADD CONSTRAINT "branch_delivery_lines_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "branch_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_delivery_lines" ADD CONSTRAINT "branch_delivery_lines_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_delivery_lines" ADD CONSTRAINT "branch_delivery_lines_warehouse_location_from_id_fkey" FOREIGN KEY ("warehouse_location_from_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_center_inventories" ADD CONSTRAINT "service_center_inventories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_center_inventories" ADD CONSTRAINT "service_center_inventories_service_center_id_fkey" FOREIGN KEY ("service_center_id") REFERENCES "service_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_center_inventories" ADD CONSTRAINT "service_center_inventories_service_center_location_id_fkey" FOREIGN KEY ("service_center_location_id") REFERENCES "service_center_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_center_inventories" ADD CONSTRAINT "service_center_inventories_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_center_inventories" ADD CONSTRAINT "service_center_inventories_status_code_id_fkey" FOREIGN KEY ("status_code_id") REFERENCES "reason_status_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_center_orders" ADD CONSTRAINT "service_center_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_center_orders" ADD CONSTRAINT "service_center_orders_service_center_id_fkey" FOREIGN KEY ("service_center_id") REFERENCES "service_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_center_orders" ADD CONSTRAINT "service_center_orders_service_center_location_id_fkey" FOREIGN KEY ("service_center_location_id") REFERENCES "service_center_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_center_orders" ADD CONSTRAINT "service_center_orders_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_center_orders" ADD CONSTRAINT "service_center_orders_package_type_id_fkey" FOREIGN KEY ("package_type_id") REFERENCES "package_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_center_order_details" ADD CONSTRAINT "service_center_order_details_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_center_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_center_order_details" ADD CONSTRAINT "service_center_order_details_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_center_order_approval_levels" ADD CONSTRAINT "service_center_order_approval_levels_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_center_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_center_deliveries" ADD CONSTRAINT "service_center_deliveries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_center_deliveries" ADD CONSTRAINT "service_center_deliveries_service_center_id_fkey" FOREIGN KEY ("service_center_id") REFERENCES "service_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_center_deliveries" ADD CONSTRAINT "service_center_deliveries_service_center_location_id_fkey" FOREIGN KEY ("service_center_location_id") REFERENCES "service_center_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_center_deliveries" ADD CONSTRAINT "service_center_deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_center_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_center_deliveries" ADD CONSTRAINT "service_center_deliveries_status_code_id_fkey" FOREIGN KEY ("status_code_id") REFERENCES "reason_status_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_backloads" ADD CONSTRAINT "service_backloads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_backloads" ADD CONSTRAINT "service_backloads_service_center_id_fkey" FOREIGN KEY ("service_center_id") REFERENCES "service_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_backloads" ADD CONSTRAINT "service_backloads_service_center_location_id_fkey" FOREIGN KEY ("service_center_location_id") REFERENCES "service_center_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_backloads" ADD CONSTRAINT "service_backloads_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "service_center_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_backloads" ADD CONSTRAINT "service_backloads_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_center_sales_transactions" ADD CONSTRAINT "service_center_sales_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_center_sales_transactions" ADD CONSTRAINT "service_center_sales_transactions_service_center_id_fkey" FOREIGN KEY ("service_center_id") REFERENCES "service_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_center_sales_transactions" ADD CONSTRAINT "service_center_sales_transactions_service_center_location_id_fkey" FOREIGN KEY ("service_center_location_id") REFERENCES "service_center_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_center_sales_transactions" ADD CONSTRAINT "service_center_sales_transactions_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_center_sales_transactions" ADD CONSTRAINT "service_center_sales_transactions_package_type_id_fkey" FOREIGN KEY ("package_type_id") REFERENCES "package_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_center_sales_transactions" ADD CONSTRAINT "service_center_sales_transactions_payment_type_id_fkey" FOREIGN KEY ("payment_type_id") REFERENCES "payment_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_center_sales_transactions" ADD CONSTRAINT "service_center_sales_transactions_sale_type_id_fkey" FOREIGN KEY ("sale_type_id") REFERENCES "sale_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_center_sales_transactions" ADD CONSTRAINT "service_center_sales_transactions_promo_type_id_fkey" FOREIGN KEY ("promo_type_id") REFERENCES "promo_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_center_sales_transactions" ADD CONSTRAINT "service_center_sales_transactions_customer_delivery_method_id_fkey" FOREIGN KEY ("customer_delivery_method_id") REFERENCES "customer_delivery_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_center_pullouts" ADD CONSTRAINT "service_center_pullouts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_center_pullouts" ADD CONSTRAINT "service_center_pullouts_service_center_id_fkey" FOREIGN KEY ("service_center_id") REFERENCES "service_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_center_pullouts" ADD CONSTRAINT "service_center_pullouts_service_center_location_id_fkey" FOREIGN KEY ("service_center_location_id") REFERENCES "service_center_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_center_pullouts" ADD CONSTRAINT "service_center_pullouts_status_code_id_fkey" FOREIGN KEY ("status_code_id") REFERENCES "reason_status_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_center_pullouts" ADD CONSTRAINT "service_center_pullouts_reason_status_id_fkey" FOREIGN KEY ("reason_status_id") REFERENCES "reason_statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_center_pullouts" ADD CONSTRAINT "service_center_pullouts_reason_status_code_id_fkey" FOREIGN KEY ("reason_status_code_id") REFERENCES "reason_status_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_center_pullout_details" ADD CONSTRAINT "service_center_pullout_details_pullout_id_fkey" FOREIGN KEY ("pullout_id") REFERENCES "service_center_pullouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_center_pullout_details" ADD CONSTRAINT "service_center_pullout_details_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_center_pullout_approval_levels" ADD CONSTRAINT "service_center_pullout_approval_levels_pullout_id_fkey" FOREIGN KEY ("pullout_id") REFERENCES "service_center_pullouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
