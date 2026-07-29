-- CreateTable
CREATE TABLE "competitors" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "record_status" "LookupRecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "competitors_tenant_id_idx" ON "competitors"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "competitors_tenant_id_name_key" ON "competitors"("tenant_id", "name");

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill Competitor master rows from distinct observation names
INSERT INTO "competitors" ("id", "tenant_id", "name", "record_status", "created_at", "updated_at")
SELECT
    'c' || substr(md5(co.tenant_id || E'\n' || co.competitor_name || E'\n' || gen_random_uuid()::text), 1, 24),
    co.tenant_id,
    co.competitor_name,
    'active'::"LookupRecordStatus",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "tenant_id", "competitor_name"
    FROM "competitor_observations"
) AS co;

-- AlterTable: add competitor_id (nullable for backfill), then promotion
ALTER TABLE "competitor_observations" ADD COLUMN "competitor_id" TEXT;
ALTER TABLE "competitor_observations" ADD COLUMN "promotion" VARCHAR(255);

-- Link observations to backfilled competitors
UPDATE "competitor_observations" AS obs
SET "competitor_id" = c.id
FROM "competitors" AS c
WHERE c."tenant_id" = obs."tenant_id"
  AND c."name" = obs."competitor_name";

-- Fail loudly if any observation could not be linked
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "competitor_observations" WHERE "competitor_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'competitor_observations.competitor_id backfill left NULL rows';
  END IF;
END $$;

-- Enforce NOT NULL after backfill
ALTER TABLE "competitor_observations" ALTER COLUMN "competitor_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "competitor_observations_tenant_id_competitor_id_idx" ON "competitor_observations"("tenant_id", "competitor_id");

-- AddForeignKey
ALTER TABLE "competitor_observations" ADD CONSTRAINT "competitor_observations_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
