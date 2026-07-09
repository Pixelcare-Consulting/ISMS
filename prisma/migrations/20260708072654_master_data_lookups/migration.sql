-- AlterTable
ALTER TABLE "areas" ADD COLUMN     "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "payment_types" ADD COLUMN     "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "provinces" ADD COLUMN     "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "regions" ADD COLUMN     "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "sale_types" ADD COLUMN     "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE "features" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sizes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actual_sizes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "size_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "class" TEXT,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actual_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resolutions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_areas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_areas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mode_of_payments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mode_of_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_delivery_methods" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_delivery_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_descriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "document_type_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_status_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_status_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "features_tenant_id_idx" ON "features"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "features_tenant_id_name_key" ON "features"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "sizes_tenant_id_idx" ON "sizes"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "sizes_tenant_id_name_key" ON "sizes"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "actual_sizes_tenant_id_idx" ON "actual_sizes"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "actual_sizes_tenant_id_size_id_name_key" ON "actual_sizes"("tenant_id", "size_id", "name");

-- CreateIndex
CREATE INDEX "resolutions_tenant_id_idx" ON "resolutions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "resolutions_tenant_id_name_key" ON "resolutions"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "dealer_areas_tenant_id_idx" ON "dealer_areas"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_areas_tenant_id_name_key" ON "dealer_areas"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "branch_areas_tenant_id_idx" ON "branch_areas"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_areas_tenant_id_name_key" ON "branch_areas"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "mode_of_payments_tenant_id_idx" ON "mode_of_payments"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "mode_of_payments_tenant_id_name_key" ON "mode_of_payments"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "promo_types_tenant_id_idx" ON "promo_types"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "promo_types_tenant_id_name_key" ON "promo_types"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "dealer_types_tenant_id_idx" ON "dealer_types"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_types_tenant_id_name_key" ON "dealer_types"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "customer_delivery_methods_tenant_id_idx" ON "customer_delivery_methods"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_delivery_methods_tenant_id_name_key" ON "customer_delivery_methods"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "problem_descriptions_tenant_id_idx" ON "problem_descriptions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "problem_descriptions_tenant_id_name_key" ON "problem_descriptions"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "document_types_tenant_id_idx" ON "document_types"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_tenant_id_name_key" ON "document_types"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "return_types_tenant_id_idx" ON "return_types"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_types_tenant_id_document_type_id_name_key" ON "return_types"("tenant_id", "document_type_id", "name");

-- CreateIndex
CREATE INDEX "branch_status_types_tenant_id_idx" ON "branch_status_types"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_status_types_tenant_id_name_key" ON "branch_status_types"("tenant_id", "name");

-- AddForeignKey
ALTER TABLE "features" ADD CONSTRAINT "features_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sizes" ADD CONSTRAINT "sizes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_sizes" ADD CONSTRAINT "actual_sizes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_sizes" ADD CONSTRAINT "actual_sizes_size_id_fkey" FOREIGN KEY ("size_id") REFERENCES "sizes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_areas" ADD CONSTRAINT "dealer_areas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_areas" ADD CONSTRAINT "branch_areas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mode_of_payments" ADD CONSTRAINT "mode_of_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_types" ADD CONSTRAINT "promo_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_types" ADD CONSTRAINT "dealer_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_delivery_methods" ADD CONSTRAINT "customer_delivery_methods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_descriptions" ADD CONSTRAINT "problem_descriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_types" ADD CONSTRAINT "document_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_types" ADD CONSTRAINT "return_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_types" ADD CONSTRAINT "return_types_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_status_types" ADD CONSTRAINT "branch_status_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
