-- One delivery per order (idempotent delivery creation from approved orders).
-- NULL order_id rows remain allowed (Postgres treats NULLs as distinct).
DROP INDEX IF EXISTS "branch_deliveries_tenant_id_order_id_idx";

CREATE UNIQUE INDEX "branch_deliveries_tenant_id_order_id_key"
  ON "branch_deliveries" ("tenant_id", "order_id");
