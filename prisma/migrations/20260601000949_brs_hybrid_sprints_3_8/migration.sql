-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "BranchInventoryStatus" AS ENUM ('DeliveryInTransit', 'Stock', 'Sold', 'Reserved', 'Defective', 'ForPullout');

-- CreateEnum
CREATE TYPE "BranchOrderStatus" AS ENUM ('draft', 'pending_tl', 'pending_sp', 'pending_logistics', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "BranchOrderType" AS ENUM ('auto_replenish', 'manual', 'special');

-- CreateEnum
CREATE TYPE "BranchTransferStatus" AS ENUM ('draft', 'pending_tl', 'in_transit', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "BranchPulloutStatus" AS ENUM ('draft', 'pending_tl', 'pending_logistics', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "BranchDeliveryStatus" AS ENUM ('pending', 'accepted', 'partial');

-- CreateEnum
CREATE TYPE "AtrStatus" AS ENUM ('open', 'reserve', 'closed');

-- CreateEnum
CREATE TYPE "SkuStatus" AS ENUM ('active', 'hold', 'retired');

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "brand_id" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_models" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "brand_id" TEXT,
    "category_id" TEXT,
    "sku_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SkuStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provinces" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "region_id" TEXT,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provinces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sap_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branch_area_id" TEXT,
    "delivery_schedule" JSONB,
    "status" "BranchStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_locations" (
    "id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alternate_warehouses" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alternate_warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aors" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "warehouse_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "serial_numbers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "serial_no" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "serial_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_inventories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "serial_number_id" TEXT NOT NULL,
    "status" "BranchInventoryStatus" NOT NULL DEFAULT 'DeliveryInTransit',
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_planograms" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "max_qty" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_planograms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_mil_settings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "days_threshold" INTEGER NOT NULL DEFAULT 30,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_mil_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "order_type" "BranchOrderType" NOT NULL,
    "status" "BranchOrderStatus" NOT NULL DEFAULT 'pending_tl',
    "order_number" TEXT NOT NULL,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_order_details" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "branch_order_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_order_approval_levels" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "role_slug" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "rejected_at" TIMESTAMP(3),
    "comment" TEXT,

    CONSTRAINT "branch_order_approval_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_deliveries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "delivery_no" TEXT NOT NULL,
    "status" "BranchDeliveryStatus" NOT NULL DEFAULT 'pending',
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_transfers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "from_branch_id" TEXT NOT NULL,
    "to_branch_id" TEXT NOT NULL,
    "transfer_no" TEXT NOT NULL,
    "status" "BranchTransferStatus" NOT NULL DEFAULT 'pending_tl',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_pullouts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "pullout_no" TEXT NOT NULL,
    "status" "BranchPulloutStatus" NOT NULL DEFAULT 'pending_tl',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_pullouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_sales_transactions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "serial_number_id" TEXT,
    "transaction_no" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "atr_status" "AtrStatus" NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_sales_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brands_tenant_id_idx" ON "brands"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "brands_tenant_id_name_key" ON "brands"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "categories_tenant_id_idx" ON "categories"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenant_id_name_key" ON "categories"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "product_models_tenant_id_idx" ON "product_models"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_models_tenant_id_sku_code_key" ON "product_models"("tenant_id", "sku_code");

-- CreateIndex
CREATE INDEX "areas_tenant_id_idx" ON "areas"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "areas_tenant_id_code_key" ON "areas"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "regions_tenant_id_idx" ON "regions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "regions_tenant_id_name_key" ON "regions"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "provinces_tenant_id_idx" ON "provinces"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "provinces_tenant_id_name_key" ON "provinces"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "package_types_tenant_id_idx" ON "package_types"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "package_types_tenant_id_name_key" ON "package_types"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "payment_types_tenant_id_idx" ON "payment_types"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_types_tenant_id_name_key" ON "payment_types"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "sale_types_tenant_id_idx" ON "sale_types"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_types_tenant_id_name_key" ON "sale_types"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "branches_tenant_id_idx" ON "branches"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenant_id_sap_code_key" ON "branches"("tenant_id", "sap_code");

-- CreateIndex
CREATE INDEX "warehouses_tenant_id_idx" ON "warehouses"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenant_id_code_key" ON "warehouses"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_locations_warehouse_id_code_key" ON "warehouse_locations"("warehouse_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "alternate_warehouses_branch_id_warehouse_id_key" ON "alternate_warehouses"("branch_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "aors_tenant_id_user_id_idx" ON "aors"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "serial_numbers_tenant_id_idx" ON "serial_numbers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "serial_numbers_tenant_id_serial_no_key" ON "serial_numbers"("tenant_id", "serial_no");

-- CreateIndex
CREATE INDEX "branch_inventories_tenant_id_branch_id_status_idx" ON "branch_inventories"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "branch_inventories_branch_id_serial_number_id_key" ON "branch_inventories"("branch_id", "serial_number_id");

-- CreateIndex
CREATE INDEX "branch_planograms_tenant_id_idx" ON "branch_planograms"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_planograms_branch_id_model_id_key" ON "branch_planograms"("branch_id", "model_id");

-- CreateIndex
CREATE INDEX "branch_mil_settings_tenant_id_idx" ON "branch_mil_settings"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_mil_settings_branch_id_model_id_key" ON "branch_mil_settings"("branch_id", "model_id");

-- CreateIndex
CREATE INDEX "branch_orders_tenant_id_branch_id_status_idx" ON "branch_orders"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "branch_orders_tenant_id_order_number_key" ON "branch_orders"("tenant_id", "order_number");

-- CreateIndex
CREATE INDEX "branch_order_details_order_id_idx" ON "branch_order_details"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_order_approval_levels_order_id_level_key" ON "branch_order_approval_levels"("order_id", "level");

-- CreateIndex
CREATE INDEX "branch_deliveries_tenant_id_branch_id_status_idx" ON "branch_deliveries"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "branch_deliveries_tenant_id_delivery_no_key" ON "branch_deliveries"("tenant_id", "delivery_no");

-- CreateIndex
CREATE INDEX "branch_transfers_tenant_id_status_idx" ON "branch_transfers"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "branch_transfers_tenant_id_transfer_no_key" ON "branch_transfers"("tenant_id", "transfer_no");

-- CreateIndex
CREATE INDEX "branch_pullouts_tenant_id_branch_id_status_idx" ON "branch_pullouts"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "branch_pullouts_tenant_id_pullout_no_key" ON "branch_pullouts"("tenant_id", "pullout_no");

-- CreateIndex
CREATE INDEX "branch_sales_transactions_tenant_id_branch_id_idx" ON "branch_sales_transactions"("tenant_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_sales_transactions_tenant_id_transaction_no_key" ON "branch_sales_transactions"("tenant_id", "transaction_no");

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "areas" ADD CONSTRAINT "areas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regions" ADD CONSTRAINT "regions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provinces" ADD CONSTRAINT "provinces_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provinces" ADD CONSTRAINT "provinces_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_types" ADD CONSTRAINT "package_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_types" ADD CONSTRAINT "payment_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_types" ADD CONSTRAINT "sale_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_branch_area_id_fkey" FOREIGN KEY ("branch_area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_locations" ADD CONSTRAINT "warehouse_locations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alternate_warehouses" ADD CONSTRAINT "alternate_warehouses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alternate_warehouses" ADD CONSTRAINT "alternate_warehouses_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aors" ADD CONSTRAINT "aors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aors" ADD CONSTRAINT "aors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aors" ADD CONSTRAINT "aors_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aors" ADD CONSTRAINT "aors_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_inventories" ADD CONSTRAINT "branch_inventories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_inventories" ADD CONSTRAINT "branch_inventories_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_inventories" ADD CONSTRAINT "branch_inventories_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_inventories" ADD CONSTRAINT "branch_inventories_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_planograms" ADD CONSTRAINT "branch_planograms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_planograms" ADD CONSTRAINT "branch_planograms_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_planograms" ADD CONSTRAINT "branch_planograms_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_mil_settings" ADD CONSTRAINT "branch_mil_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_mil_settings" ADD CONSTRAINT "branch_mil_settings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_mil_settings" ADD CONSTRAINT "branch_mil_settings_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_orders" ADD CONSTRAINT "branch_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_orders" ADD CONSTRAINT "branch_orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_orders" ADD CONSTRAINT "branch_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_orders" ADD CONSTRAINT "branch_orders_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_order_details" ADD CONSTRAINT "branch_order_details_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "branch_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_order_details" ADD CONSTRAINT "branch_order_details_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_order_approval_levels" ADD CONSTRAINT "branch_order_approval_levels_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "branch_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_deliveries" ADD CONSTRAINT "branch_deliveries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_deliveries" ADD CONSTRAINT "branch_deliveries_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_transfers" ADD CONSTRAINT "branch_transfers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_transfers" ADD CONSTRAINT "branch_transfers_from_branch_id_fkey" FOREIGN KEY ("from_branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_transfers" ADD CONSTRAINT "branch_transfers_to_branch_id_fkey" FOREIGN KEY ("to_branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_pullouts" ADD CONSTRAINT "branch_pullouts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_pullouts" ADD CONSTRAINT "branch_pullouts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_pullouts" ADD CONSTRAINT "branch_pullouts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_sales_transactions" ADD CONSTRAINT "branch_sales_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_sales_transactions" ADD CONSTRAINT "branch_sales_transactions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_sales_transactions" ADD CONSTRAINT "branch_sales_transactions_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
