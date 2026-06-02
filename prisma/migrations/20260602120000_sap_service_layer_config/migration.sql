-- SAP Business One Service Layer connection settings (per tenant)

CREATE TABLE "sap_service_layer_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "company_db" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_encrypted" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "verify_ssl" BOOLEAN NOT NULL DEFAULT true,
    "language_code" TEXT NOT NULL DEFAULT '23',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sap_service_layer_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sap_service_layer_configs_tenant_id_key" ON "sap_service_layer_configs"("tenant_id");

ALTER TABLE "sap_service_layer_configs" ADD CONSTRAINT "sap_service_layer_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
