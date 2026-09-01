-- CreateTable
CREATE TABLE "sap_sync_cursors" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "last_key" INTEGER NOT NULL DEFAULT 0,
    "total_at_source" INTEGER,
    "caught_up_at" TIMESTAMP(3),
    "pending_from_key" INTEGER,
    "pending_parent_count" INTEGER,
    "last_run_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sap_sync_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sap_sync_cursors_tenant_id_entity_key" ON "sap_sync_cursors"("tenant_id", "entity");

-- AddForeignKey
ALTER TABLE "sap_sync_cursors" ADD CONSTRAINT "sap_sync_cursors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
