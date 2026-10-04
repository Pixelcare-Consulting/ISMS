-- SAP auto-check: a scheduled, read-only comparison of SAP against ISMS that notifies the
-- users who can sync a module when SAP has data ISMS doesn't. Adds a permission-scoped
-- notification audience and one watch row per tenant × sync.
--
-- `ADD VALUE` runs inside Prisma's migration transaction; that is allowed on Postgres 12+
-- as long as the new value isn't used in the same transaction, and nothing below uses it.

-- AlterEnum
ALTER TYPE "NotificationAudience" ADD VALUE 'PERMISSION';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "permission_key" TEXT;

-- CreateTable
CREATE TABLE "sap_change_watches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sync_key" TEXT NOT NULL,
    "fingerprint" TEXT,
    "notification_id" TEXT,
    "high_key" TEXT,
    "pending_keys" JSONB,
    "checked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sap_change_watches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sap_change_watches_tenant_id_sync_key_key" ON "sap_change_watches"("tenant_id", "sync_key");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_audience_permission_key_idx" ON "notifications"("tenant_id", "audience", "permission_key");

-- AddForeignKey
ALTER TABLE "sap_change_watches" ADD CONSTRAINT "sap_change_watches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

