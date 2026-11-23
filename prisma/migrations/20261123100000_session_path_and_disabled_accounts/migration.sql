-- Account off-switch, durable activity clock, and real Site Traffic paths.
ALTER TABLE "users" ADD COLUMN "disabled_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "last_active_at" TIMESTAMP(3);

-- Keep the newest session activity so a later session sweep does not look like "never signed in".
UPDATE "users" AS u
SET "last_active_at" = s.latest
FROM (
  SELECT "user_id", MAX("last_active_at") AS latest
  FROM "sessions"
  GROUP BY "user_id"
) AS s
WHERE u."id" = s."user_id";

CREATE INDEX "users_last_active_at_idx" ON "users"("last_active_at");

ALTER TABLE "sessions" ADD COLUMN "last_path" TEXT;
ALTER TABLE "sessions" ADD COLUMN "last_path_at" TIMESTAMP(3);
CREATE INDEX "sessions_last_active_at_idx" ON "sessions"("last_active_at");

CREATE TABLE "site_page_hits" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "hit_count" INTEGER NOT NULL DEFAULT 0,
  "last_hit_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "site_page_hits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "site_page_hits_tenant_id_path_key" ON "site_page_hits"("tenant_id", "path");
CREATE INDEX "site_page_hits_tenant_id_last_hit_at_idx" ON "site_page_hits"("tenant_id", "last_hit_at");

ALTER TABLE "site_page_hits"
ADD CONSTRAINT "site_page_hits_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
