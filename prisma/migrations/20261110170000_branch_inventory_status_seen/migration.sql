-- When a branch unit's status code last changed, plus each user's seen cursor and per-unit reads.
-- Existing units take the latest inv_status_update history time. Units with no such history stay null.

ALTER TABLE "branch_inventories" ADD COLUMN "status_updated_at" TIMESTAMP(3);

UPDATE "branch_inventories" AS bi
SET "status_updated_at" = latest."created_at"
FROM (
  SELECT DISTINCT ON ("serial_number_id")
    "serial_number_id",
    "created_at"
  FROM "serial_number_histories"
  WHERE "txn_type" = 'inv_status_update'::"SerialHistoryTxnType"
  ORDER BY "serial_number_id", "created_at" DESC
) AS latest
WHERE bi."serial_number_id" = latest."serial_number_id";

CREATE INDEX "branch_inventories_tenant_id_branch_id_status_updated_at_idx"
  ON "branch_inventories"("tenant_id", "branch_id", "status_updated_at");

CREATE TABLE "branch_inventory_seen_cursors" (
  "user_id" TEXT NOT NULL,
  "seen_through_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "branch_inventory_seen_cursors_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "branch_inventory_reads" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "branch_inventory_id" TEXT NOT NULL,
  "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "branch_inventory_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "branch_inventory_reads_user_id_branch_inventory_id_key"
  ON "branch_inventory_reads"("user_id", "branch_inventory_id");

CREATE INDEX "branch_inventory_reads_user_id_idx" ON "branch_inventory_reads"("user_id");

CREATE INDEX "branch_inventory_reads_branch_inventory_id_idx"
  ON "branch_inventory_reads"("branch_inventory_id");

ALTER TABLE "branch_inventory_seen_cursors"
  ADD CONSTRAINT "branch_inventory_seen_cursors_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_inventory_reads"
  ADD CONSTRAINT "branch_inventory_reads_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_inventory_reads"
  ADD CONSTRAINT "branch_inventory_reads_branch_inventory_id_fkey"
  FOREIGN KEY ("branch_inventory_id") REFERENCES "branch_inventories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
