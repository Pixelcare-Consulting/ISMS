-- CreateTable
CREATE TABLE "competitor_brands" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitor_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_models" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "competitor_brand_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitor_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "competitor_brands_tenant_id_idx" ON "competitor_brands"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_brands_tenant_id_name_key" ON "competitor_brands"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "competitor_models_tenant_id_idx" ON "competitor_models"("tenant_id");

-- CreateIndex
CREATE INDEX "competitor_models_competitor_brand_id_idx" ON "competitor_models"("competitor_brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_models_tenant_id_competitor_brand_id_name_key" ON "competitor_models"("tenant_id", "competitor_brand_id", "name");

-- AddForeignKey
ALTER TABLE "competitor_brands" ADD CONSTRAINT "competitor_brands_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_models" ADD CONSTRAINT "competitor_models_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_models" ADD CONSTRAINT "competitor_models_competitor_brand_id_fkey" FOREIGN KEY ("competitor_brand_id") REFERENCES "competitor_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add new competitor brand/model columns
ALTER TABLE "competitor_observations" ADD COLUMN "competitor_brand_id" TEXT;
ALTER TABLE "competitor_observations" ADD COLUMN "competitor_model_id" TEXT;
ALTER TABLE "competitor_observations" ADD COLUMN "brand_name" TEXT;
ALTER TABLE "competitor_observations" ADD COLUMN "model_name" TEXT;

-- Backfill competitor brands from distinct observation brand FKs
INSERT INTO "competitor_brands" ("id", "tenant_id", "name", "record_status", "created_at", "updated_at")
SELECT
    'cb' || substr(md5(src.tenant_id || E'\n' || src.brand_name || E'\nbrand'), 1, 23),
    src.tenant_id,
    src.brand_name,
    'active'::"LookupRecordStatus",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT co.tenant_id, b.name AS brand_name
    FROM "competitor_observations" co
    INNER JOIN "brands" b ON b.id = co.brand_id
    WHERE co.brand_id IS NOT NULL
) AS src
ON CONFLICT ("tenant_id", "name") DO NOTHING;

-- Backfill competitor brands from models' brands (when observation has model but brand may differ)
INSERT INTO "competitor_brands" ("id", "tenant_id", "name", "record_status", "created_at", "updated_at")
SELECT
    'cb' || substr(md5(src.tenant_id || E'\n' || src.brand_name || E'\nbrand'), 1, 23),
    src.tenant_id,
    src.brand_name,
    'active'::"LookupRecordStatus",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT co.tenant_id, b.name AS brand_name
    FROM "competitor_observations" co
    INNER JOIN "product_models" pm ON pm.id = co.model_id
    INNER JOIN "brands" b ON b.id = pm.brand_id
    WHERE co.model_id IS NOT NULL
      AND pm.brand_id IS NOT NULL
) AS src
ON CONFLICT ("tenant_id", "name") DO NOTHING;

-- Placeholder brand for models without an inventory brand (and observation without brand_id)
INSERT INTO "competitor_brands" ("id", "tenant_id", "name", "record_status", "created_at", "updated_at")
SELECT
    'cb' || substr(md5(src.tenant_id || E'\n(Unspecified)\nbrand'), 1, 23),
    src.tenant_id,
    '(Unspecified)',
    'active'::"LookupRecordStatus",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT co.tenant_id
    FROM "competitor_observations" co
    INNER JOIN "product_models" pm ON pm.id = co.model_id
    WHERE co.model_id IS NOT NULL
      AND pm.brand_id IS NULL
      AND co.brand_id IS NULL
) AS src
ON CONFLICT ("tenant_id", "name") DO NOTHING;

-- Backfill competitor models from observation model FKs
INSERT INTO "competitor_models" ("id", "tenant_id", "competitor_brand_id", "name", "record_status", "created_at", "updated_at")
SELECT
    'cm' || substr(md5(src.tenant_id || E'\n' || src.competitor_brand_id || E'\n' || src.model_name || E'\nmodel'), 1, 23),
    src.tenant_id,
    src.competitor_brand_id,
    src.model_name,
    'active'::"LookupRecordStatus",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT
        co.tenant_id,
        pm.name AS model_name,
        COALESCE(
            cb_obs.id,
            cb_pm.id,
            cb_unspec.id
        ) AS competitor_brand_id
    FROM "competitor_observations" co
    INNER JOIN "product_models" pm ON pm.id = co.model_id
    LEFT JOIN "brands" b_obs ON b_obs.id = co.brand_id
    LEFT JOIN "competitor_brands" cb_obs
      ON cb_obs.tenant_id = co.tenant_id AND cb_obs.name = b_obs.name
    LEFT JOIN "brands" b_pm ON b_pm.id = pm.brand_id
    LEFT JOIN "competitor_brands" cb_pm
      ON cb_pm.tenant_id = co.tenant_id AND cb_pm.name = b_pm.name
    LEFT JOIN "competitor_brands" cb_unspec
      ON cb_unspec.tenant_id = co.tenant_id AND cb_unspec.name = '(Unspecified)'
    WHERE co.model_id IS NOT NULL
) AS src
WHERE src.competitor_brand_id IS NOT NULL
ON CONFLICT ("tenant_id", "competitor_brand_id", "name") DO NOTHING;

-- Remap observations: brand FK → competitor brand + snapshot
UPDATE "competitor_observations" AS obs
SET
    "competitor_brand_id" = cb.id,
    "brand_name" = cb.name
FROM "brands" AS b
INNER JOIN "competitor_brands" AS cb
  ON cb.tenant_id = b.tenant_id AND cb.name = b.name
WHERE obs.brand_id = b.id
  AND obs.brand_id IS NOT NULL;

-- Remap observations: model FK → competitor model + snapshot
-- Prefer brand already set; else model's brand; else (Unspecified)
UPDATE "competitor_observations" AS obs
SET
    "competitor_model_id" = mapped.competitor_model_id,
    "model_name" = mapped.model_name,
    "competitor_brand_id" = COALESCE(obs.competitor_brand_id, mapped.competitor_brand_id),
    "brand_name" = COALESCE(obs.brand_name, mapped.brand_name)
FROM (
    SELECT
        co.id AS observation_id,
        cm.id AS competitor_model_id,
        cm.name AS model_name,
        cm.competitor_brand_id,
        cb.name AS brand_name
    FROM "competitor_observations" co
    INNER JOIN "product_models" pm ON pm.id = co.model_id
    INNER JOIN "competitor_models" cm
      ON cm.tenant_id = co.tenant_id AND cm.name = pm.name
    INNER JOIN "competitor_brands" cb ON cb.id = cm.competitor_brand_id
    LEFT JOIN "brands" b_obs ON b_obs.id = co.brand_id
    LEFT JOIN "brands" b_pm ON b_pm.id = pm.brand_id
    WHERE co.model_id IS NOT NULL
      AND (
        (b_obs.name IS NOT NULL AND cb.name = b_obs.name)
        OR (b_obs.name IS NULL AND b_pm.name IS NOT NULL AND cb.name = b_pm.name)
        OR (b_obs.name IS NULL AND b_pm.name IS NULL AND cb.name = '(Unspecified)')
      )
) AS mapped
WHERE obs.id = mapped.observation_id;

-- Drop old inventory Brand / ProductModel FKs and columns
ALTER TABLE "competitor_observations" DROP CONSTRAINT IF EXISTS "competitor_observations_brand_id_fkey";
ALTER TABLE "competitor_observations" DROP CONSTRAINT IF EXISTS "competitor_observations_model_id_fkey";
ALTER TABLE "competitor_observations" DROP COLUMN IF EXISTS "brand_id";
ALTER TABLE "competitor_observations" DROP COLUMN IF EXISTS "model_id";

-- CreateIndex
CREATE INDEX "competitor_observations_tenant_id_competitor_brand_id_idx" ON "competitor_observations"("tenant_id", "competitor_brand_id");

-- AddForeignKey
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_competitor_brand_id_fkey" FOREIGN KEY ("competitor_brand_id") REFERENCES "competitor_brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_competitor_model_id_fkey" FOREIGN KEY ("competitor_model_id") REFERENCES "competitor_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
