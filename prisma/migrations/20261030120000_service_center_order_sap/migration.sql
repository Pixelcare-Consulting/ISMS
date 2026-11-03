-- Service-center orders post a SAP Sales Order on approval.
ALTER TYPE "SapIntegrationJobType" ADD VALUE 'service_center_order';

ALTER TABLE "service_center_orders"
  ADD COLUMN "po_number" TEXT,
  ADD COLUMN "project_code" TEXT,
  ADD COLUMN "sap_card_code" TEXT,
  ADD COLUMN "sap_warehouse_code" TEXT,
  ADD COLUMN "sap_branch_code" TEXT,
  ADD COLUMN "sap_department_code" TEXT,
  ADD COLUMN "sap_cogs_branch_code" TEXT,
  ADD COLUMN "sap_doc_ref" TEXT,
  ADD COLUMN "sap_doc_entry" INTEGER,
  ADD COLUMN "sap_doc_num" INTEGER;

CREATE TABLE "service_center_ordering_settings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "warehouse_code" TEXT,
    "branch_code" TEXT,
    "department_code" TEXT,
    "cogs_branch_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_center_ordering_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_center_ordering_settings_tenant_id_key" ON "service_center_ordering_settings"("tenant_id");

ALTER TABLE "service_center_ordering_settings" ADD CONSTRAINT "service_center_ordering_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "service_center_order_customers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "card_code" TEXT NOT NULL,
    "card_name" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_center_order_customers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_center_order_customers_tenant_id_card_code_key" ON "service_center_order_customers"("tenant_id", "card_code");
CREATE INDEX "service_center_order_customers_tenant_id_idx" ON "service_center_order_customers"("tenant_id");
-- At most one primary customer per tenant.
CREATE UNIQUE INDEX "service_center_order_customers_one_primary" ON "service_center_order_customers"("tenant_id") WHERE "is_primary";

ALTER TABLE "service_center_order_customers" ADD CONSTRAINT "service_center_order_customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defaults agreed 2026-10-30 (SO 25488): CELG004 REPLACEMENT PROGRAM, warehouse FWH14P1F,
-- branch ELG004, department CS, COGS branch ELG004. Seeded for tenants connected to SAP.
INSERT INTO "service_center_ordering_settings"
    ("id", "tenant_id", "warehouse_code", "branch_code", "department_code", "cogs_branch_code", "updated_at")
SELECT 'scos_' || c."tenant_id", c."tenant_id", 'FWH14P1F', 'ELG004', 'CS', 'ELG004', CURRENT_TIMESTAMP
  FROM (SELECT DISTINCT "tenant_id" FROM "sap_service_layer_configs") c
ON CONFLICT ("tenant_id") DO NOTHING;

INSERT INTO "service_center_order_customers"
    ("id", "tenant_id", "card_code", "card_name", "is_primary", "updated_at")
SELECT 'scoc_' || c."tenant_id", c."tenant_id", 'CELG004', 'REPLACEMENT PROGRAM', true, CURRENT_TIMESTAMP
  FROM (SELECT DISTINCT "tenant_id" FROM "sap_service_layer_configs") c
ON CONFLICT ("tenant_id", "card_code") DO NOTHING;
