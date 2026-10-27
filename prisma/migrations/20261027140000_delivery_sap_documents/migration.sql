-- ITs / DRs that SAP users create with Copy To from an order's ITR / SO, as the cron
-- follow-up applies them. One row per SAP document so none is applied twice.
CREATE TABLE IF NOT EXISTS "delivery_sap_documents" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "delivery_id" TEXT NOT NULL,
  "doc_kind" TEXT NOT NULL,
  "doc_entry" INTEGER NOT NULL,
  "doc_num" INTEGER NOT NULL,
  "display_no" TEXT NOT NULL,
  "doc_date" DATE,
  "status" TEXT NOT NULL,
  "serial_count" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "delivery_sap_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_sap_documents_tenant_id_doc_kind_doc_entry_key"
  ON "delivery_sap_documents"("tenant_id", "doc_kind", "doc_entry");
CREATE INDEX IF NOT EXISTS "delivery_sap_documents_delivery_id_idx"
  ON "delivery_sap_documents"("delivery_id");
CREATE INDEX IF NOT EXISTS "delivery_sap_documents_tenant_id_status_idx"
  ON "delivery_sap_documents"("tenant_id", "status");

DO $$ BEGIN
  ALTER TABLE "delivery_sap_documents"
    ADD CONSTRAINT "delivery_sap_documents_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "delivery_sap_documents"
    ADD CONSTRAINT "delivery_sap_documents_delivery_id_fkey"
    FOREIGN KEY ("delivery_id") REFERENCES "branch_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
