-- Encrypt all Service Layer credential columns at rest (rename to *_encrypted)

ALTER TABLE "sap_service_layer_configs" RENAME COLUMN "base_url" TO "base_url_encrypted";
ALTER TABLE "sap_service_layer_configs" RENAME COLUMN "company_db" TO "company_db_encrypted";
ALTER TABLE "sap_service_layer_configs" RENAME COLUMN "username" TO "username_encrypted";

-- Legacy rows may hold plaintext in renamed columns; re-save via Settings UI to re-encrypt.
