-- Align auth tables to Better Auth; RED/YELLOW schema gaps (Dealer, Service Centers, PriceList, Branch FKs, etc.)

-- ========== Better Auth: rebuild Account / Session; replace VerificationToken ==========
DROP TABLE IF EXISTS "sessions";
DROP TABLE IF EXISTS "accounts";
DROP TABLE IF EXISTS "verification_tokens";

CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- User.emailVerified DateTime? → Boolean; name non-null
ALTER TABLE "users" ADD COLUMN "email_verified_bool" BOOLEAN NOT NULL DEFAULT false;
UPDATE "users" SET "email_verified_bool" = ("email_verified" IS NOT NULL);
ALTER TABLE "users" DROP COLUMN "email_verified";
ALTER TABLE "users" RENAME COLUMN "email_verified_bool" TO "email_verified";
UPDATE "users" SET "name" = '' WHERE "name" IS NULL;
ALTER TABLE "users" ALTER COLUMN "name" SET DEFAULT '';
ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;

-- Seed credential accounts from existing password hashes (Better Auth email/password)
INSERT INTO "accounts" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT
  'cred_' || "id",
  "id",
  'credential',
  "id",
  "password_hash",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users"
WHERE "deleted_at" IS NULL;

-- ========== Category: drop brand ownership ==========
ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "categories_brand_id_fkey";
DROP INDEX IF EXISTS "categories_brand_id_idx";
ALTER TABLE "categories" DROP COLUMN IF EXISTS "brand_id";

-- ========== PackageType parity ==========
ALTER TABLE "package_types" ADD COLUMN IF NOT EXISTS "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active';

-- ========== ProductModel lookup FKs ==========
ALTER TABLE "product_models" ADD COLUMN IF NOT EXISTS "feature_id" TEXT;
ALTER TABLE "product_models" ADD COLUMN IF NOT EXISTS "resolution_id" TEXT;
ALTER TABLE "product_models" ADD COLUMN IF NOT EXISTS "actual_size_id" TEXT;
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "features"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_resolution_id_fkey" FOREIGN KEY ("resolution_id") REFERENCES "resolutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_actual_size_id_fkey" FOREIGN KEY ("actual_size_id") REFERENCES "actual_sizes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ========== Branch: remap Area FK + new FKs ==========
ALTER TABLE "branches" DROP CONSTRAINT IF EXISTS "branches_branch_area_id_fkey";
ALTER TABLE "branches" RENAME COLUMN "branch_area_id" TO "area_id";
ALTER TABLE "branches" ADD CONSTRAINT "branches_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "branch_area_id" TEXT;
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "dealer_id" TEXT;
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "primary_warehouse_id" TEXT;
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "region_id" TEXT;
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "province_id" TEXT;

-- ========== New RED entities ==========
CREATE TABLE "dealers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sap_code" TEXT,
    "status" "BranchStatus" NOT NULL DEFAULT 'active',
    "area_id" TEXT,
    "dealer_type_id" TEXT,
    "dealer_area_id" TEXT,
    "mode_of_payment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "dealers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dealers_tenant_id_name_key" ON "dealers"("tenant_id", "name");
CREATE INDEX "dealers_tenant_id_idx" ON "dealers"("tenant_id");

ALTER TABLE "dealers" ADD CONSTRAINT "dealers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dealers" ADD CONSTRAINT "dealers_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dealers" ADD CONSTRAINT "dealers_dealer_type_id_fkey" FOREIGN KEY ("dealer_type_id") REFERENCES "dealer_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dealers" ADD CONSTRAINT "dealers_dealer_area_id_fkey" FOREIGN KEY ("dealer_area_id") REFERENCES "dealer_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dealers" ADD CONSTRAINT "dealers_mode_of_payment_id_fkey" FOREIGN KEY ("mode_of_payment_id") REFERENCES "mode_of_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "service_centers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sap_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BranchStatus" NOT NULL DEFAULT 'active',
    "area_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "service_centers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_centers_tenant_id_sap_code_key" ON "service_centers"("tenant_id", "sap_code");
CREATE INDEX "service_centers_tenant_id_idx" ON "service_centers"("tenant_id");

ALTER TABLE "service_centers" ADD CONSTRAINT "service_centers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_centers" ADD CONSTRAINT "service_centers_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "service_center_locations" (
    "id" TEXT NOT NULL,
    "service_center_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area_id" TEXT,
    "dealer_area_id" TEXT,
    "region_id" TEXT,
    "province_id" TEXT,
    "branch_area_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_center_locations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_center_locations_service_center_id_code_key" ON "service_center_locations"("service_center_id", "code");

ALTER TABLE "service_center_locations" ADD CONSTRAINT "service_center_locations_service_center_id_fkey" FOREIGN KEY ("service_center_id") REFERENCES "service_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_center_locations" ADD CONSTRAINT "service_center_locations_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_center_locations" ADD CONSTRAINT "service_center_locations_dealer_area_id_fkey" FOREIGN KEY ("dealer_area_id") REFERENCES "dealer_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_center_locations" ADD CONSTRAINT "service_center_locations_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_center_locations" ADD CONSTRAINT "service_center_locations_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "provinces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_center_locations" ADD CONSTRAINT "service_center_locations_branch_area_id_fkey" FOREIGN KEY ("branch_area_id") REFERENCES "branch_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "price_lists" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "package_type_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "price_lists_tenant_id_model_id_idx" ON "price_lists"("tenant_id", "model_id");
CREATE INDEX "price_lists_tenant_id_period_start_period_end_idx" ON "price_lists"("tenant_id", "period_start", "period_end");

ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "product_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_package_type_id_fkey" FOREIGN KEY ("package_type_id") REFERENCES "package_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Branch FKs that depend on dealers/warehouses
ALTER TABLE "branches" ADD CONSTRAINT "branches_branch_area_id_fkey" FOREIGN KEY ("branch_area_id") REFERENCES "branch_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "dealers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_primary_warehouse_id_fkey" FOREIGN KEY ("primary_warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "provinces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AOR optional dealer
ALTER TABLE "aors" ADD COLUMN IF NOT EXISTS "dealer_id" TEXT;
ALTER TABLE "aors" ADD CONSTRAINT "aors_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "dealers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Package type FKs on orders/sales
ALTER TABLE "branch_orders" ADD COLUMN IF NOT EXISTS "package_type_id" TEXT;
ALTER TABLE "branch_orders" ADD CONSTRAINT "branch_orders_package_type_id_fkey" FOREIGN KEY ("package_type_id") REFERENCES "package_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "branch_sales_transactions" ADD COLUMN IF NOT EXISTS "package_type_id" TEXT;
ALTER TABLE "branch_sales_transactions" ADD CONSTRAINT "branch_sales_transactions_package_type_id_fkey" FOREIGN KEY ("package_type_id") REFERENCES "package_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
