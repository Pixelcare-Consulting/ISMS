-- Let SAP decide dealer identity: `sap_code`, not `name`.
--
-- SAP legitimately carries several customers under one CardName — a renumbering that kept
-- both the old and new record, two branches of one company. The unique name rejected 78 of
-- 1,138 customers on the first full sync, and because the winner was simply whichever code
-- sorted first, 11 of those kept a record that is inactive in SAP while skipping the active
-- one. Nothing about the name was ever the identity; the sync has always matched on code.

DROP INDEX IF EXISTS "dealers_tenant_id_name_key";

-- The dropped unique index also served name lookups and the alphabetical dealer list.
CREATE INDEX IF NOT EXISTS "dealers_tenant_id_name_idx"
ON "dealers" ("tenant_id", "name");

-- Already present on this database, applied out-of-band on 2026-08-11 by a migration that
-- was never committed (`20260811200000_dealer_sap_code_unique`) and never declared in
-- schema.prisma. Recreated here so the repo and the database finally agree and a fresh
-- database gets the constraint that now carries dealer identity on its own.
-- `sap_code` is nullable and Postgres permits many NULLs in a unique index, so dealers
-- predating the sync keep working.
CREATE UNIQUE INDEX IF NOT EXISTS "dealers_tenant_id_sap_code_key"
ON "dealers" ("tenant_id", "sap_code");
