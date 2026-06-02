-- Allow multiple SAP Service Layer configs per tenant (one can be marked active)

DROP INDEX IF EXISTS "sap_service_layer_configs_tenant_id_key";

CREATE INDEX IF NOT EXISTS "sap_service_layer_configs_tenant_id_is_enabled_idx"
ON "sap_service_layer_configs" ("tenant_id", "is_enabled");

CREATE INDEX IF NOT EXISTS "sap_service_layer_configs_tenant_id_updated_at_idx"
ON "sap_service_layer_configs" ("tenant_id", "updated_at");
