-- Optional pull-out checklist lookups. Existing lines stay null.

-- AlterTable
ALTER TABLE "branch_pullout_lines" ADD COLUMN "accessory_completeness_id" TEXT,
ADD COLUMN "pullout_classification_id" TEXT,
ADD COLUMN "unit_packing_condition_id" TEXT;

-- CreateTable
CREATE TABLE "pullout_classifications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pullout_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_packing_conditions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_packing_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessory_completeness" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accessory_completeness_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pullout_classifications_tenant_id_idx" ON "pullout_classifications"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pullout_classifications_tenant_id_name_key" ON "pullout_classifications"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "unit_packing_conditions_tenant_id_idx" ON "unit_packing_conditions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "unit_packing_conditions_tenant_id_name_key" ON "unit_packing_conditions"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "accessory_completeness_tenant_id_idx" ON "accessory_completeness"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "accessory_completeness_tenant_id_name_key" ON "accessory_completeness"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "branch_pullout_lines_pullout_classification_id_idx" ON "branch_pullout_lines"("pullout_classification_id");

-- CreateIndex
CREATE INDEX "branch_pullout_lines_unit_packing_condition_id_idx" ON "branch_pullout_lines"("unit_packing_condition_id");

-- CreateIndex
CREATE INDEX "branch_pullout_lines_accessory_completeness_id_idx" ON "branch_pullout_lines"("accessory_completeness_id");

-- AddForeignKey
ALTER TABLE "pullout_classifications" ADD CONSTRAINT "pullout_classifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_packing_conditions" ADD CONSTRAINT "unit_packing_conditions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_completeness" ADD CONSTRAINT "accessory_completeness_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_pullout_lines" ADD CONSTRAINT "branch_pullout_lines_pullout_classification_id_fkey" FOREIGN KEY ("pullout_classification_id") REFERENCES "pullout_classifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_pullout_lines" ADD CONSTRAINT "branch_pullout_lines_unit_packing_condition_id_fkey" FOREIGN KEY ("unit_packing_condition_id") REFERENCES "unit_packing_conditions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_pullout_lines" ADD CONSTRAINT "branch_pullout_lines_accessory_completeness_id_fkey" FOREIGN KEY ("accessory_completeness_id") REFERENCES "accessory_completeness"("id") ON DELETE SET NULL ON UPDATE CASCADE;
