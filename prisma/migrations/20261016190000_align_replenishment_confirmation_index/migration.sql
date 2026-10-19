-- Postgres stores identifiers at 63 bytes. The create in
-- 20261016140000_ai_assistant_policy asked for
-- ai_replenishment_confirmations_tenant_id_user_id_proposal_id_idx (64),
-- which Postgres truncated to ...proposal_id_id. Prisma derives
-- ...proposal_i_idx from schema.prisma, so migrate diff reported a rename.
-- Same columns; this only aligns the stored name. Guarded so a database
-- that is already aligned is a no-op.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'ai_replenishment_confirmations_tenant_id_user_id_proposal_id_id'
      AND c.relkind = 'i'
  ) THEN
    ALTER INDEX "ai_replenishment_confirmations_tenant_id_user_id_proposal_id_id"
      RENAME TO "ai_replenishment_confirmations_tenant_id_user_id_proposal_i_idx";
  END IF;
END $$;
