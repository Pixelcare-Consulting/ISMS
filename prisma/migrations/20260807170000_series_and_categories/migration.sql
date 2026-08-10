-- Rename model-linked categories → series (preserve existing rows)
ALTER TABLE "categories" RENAME TO "series";

ALTER INDEX IF EXISTS "categories_pkey" RENAME TO "series_pkey";
ALTER INDEX IF EXISTS "categories_tenant_id_idx" RENAME TO "series_tenant_id_idx";
ALTER INDEX IF EXISTS "categories_tenant_id_name_key" RENAME TO "series_tenant_id_name_key";

ALTER TABLE "series" RENAME CONSTRAINT "categories_tenant_id_fkey" TO "series_tenant_id_fkey";

-- Point product models at series
ALTER TABLE "product_models" DROP CONSTRAINT IF EXISTS "product_models_category_id_fkey";
ALTER TABLE "product_models" RENAME COLUMN "category_id" TO "series_id";
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- New empty standalone categories lookup
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "categories_tenant_id_idx" ON "categories"("tenant_id");
CREATE UNIQUE INDEX "categories_tenant_id_name_key" ON "categories"("tenant_id", "name");

ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
