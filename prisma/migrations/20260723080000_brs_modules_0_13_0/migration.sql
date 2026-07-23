-- BRS 0.13.0: alternate branches, package qty, official sales staging

-- Alternate warehouses → alternate branches (clear legacy warehouse-linked rows)
DELETE FROM "alternate_warehouses";

ALTER TABLE "alternate_warehouses" DROP CONSTRAINT "alternate_warehouses_warehouse_id_fkey";
DROP INDEX IF EXISTS "alternate_warehouses_branch_id_warehouse_id_key";
ALTER TABLE "alternate_warehouses" DROP COLUMN "warehouse_id";
ALTER TABLE "alternate_warehouses" ADD COLUMN "alternate_branch_id" TEXT NOT NULL;

CREATE UNIQUE INDEX "alternate_warehouses_branch_id_alternate_branch_id_key"
  ON "alternate_warehouses"("branch_id", "alternate_branch_id");

ALTER TABLE "alternate_warehouses"
  ADD CONSTRAINT "alternate_warehouses_alternate_branch_id_fkey"
  FOREIGN KEY ("alternate_branch_id") REFERENCES "branches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Package type quantity
ALTER TABLE "package_types" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;

-- Official sales import staging
CREATE TYPE "OfficialSalesImportRowStatus" AS ENUM ('pending', 'success', 'error');

CREATE TABLE "official_sales_import_batches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT,
    "file_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "official_sales_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "official_sales_import_rows" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "dr_date" DATE,
    "dr_no" TEXT,
    "result" TEXT,
    "status" "OfficialSalesImportRowStatus" NOT NULL DEFAULT 'pending',
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "official_sales_import_rows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "official_sales_import_batches_tenant_id_created_at_idx"
  ON "official_sales_import_batches"("tenant_id", "created_at");

CREATE INDEX "official_sales_import_rows_tenant_id_status_idx"
  ON "official_sales_import_rows"("tenant_id", "status");

CREATE INDEX "official_sales_import_rows_batch_id_idx"
  ON "official_sales_import_rows"("batch_id");

ALTER TABLE "official_sales_import_batches"
  ADD CONSTRAINT "official_sales_import_batches_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "official_sales_import_batches"
  ADD CONSTRAINT "official_sales_import_batches_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "official_sales_import_rows"
  ADD CONSTRAINT "official_sales_import_rows_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "official_sales_import_batches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
