-- SAP sync reconciliation: soft-delete ISMS rows that a completed sync pass no longer
-- finds in SAP, and restore them when they reappear.

-- AlterTable
ALTER TABLE "product_models" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "sap_synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "serial_numbers" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "sap_synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "sap_synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "branches" ADD COLUMN "sap_synced_at" TIMESTAMP(3),
ADD COLUMN "sap_sync_source" TEXT;

-- AlterTable
ALTER TABLE "service_centers" ADD COLUMN "sap_synced_at" TIMESTAMP(3);

-- Restart any pass already in progress. Rows applied by its earlier runs were never
-- stamped with `sap_synced_at`, so completing it would soft-delete them by mistake.
UPDATE "sap_sync_cursors"
SET "pass_started_at" = NULL, "last_key" = NULL, "pass_rows" = 0
WHERE "pass_started_at" IS NOT NULL;
