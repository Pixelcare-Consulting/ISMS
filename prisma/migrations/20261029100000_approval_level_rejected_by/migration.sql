-- Who rejected an approval level. Before this, only the time was kept for transfers and
-- pull-outs; orders wrote the rejector into approved_by_id.
ALTER TABLE "branch_order_approval_levels" ADD COLUMN "rejected_by_id" TEXT;
ALTER TABLE "branch_transfer_approval_levels" ADD COLUMN "rejected_by_id" TEXT;
ALTER TABLE "branch_pullout_approval_levels" ADD COLUMN "rejected_by_id" TEXT;

ALTER TABLE "branch_order_approval_levels"
  ADD CONSTRAINT "branch_order_approval_levels_rejected_by_id_fkey"
  FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Orders: the rejector is already on the row.
UPDATE "branch_order_approval_levels"
SET "rejected_by_id" = "approved_by_id"
WHERE "rejected_at" IS NOT NULL AND "approved_by_id" IS NOT NULL;

-- Transfers and pull-outs: take the user from the latest rejection audit of that record.
UPDATE "branch_transfer_approval_levels" AS level
SET "rejected_by_id" = audit."user_id"
FROM (
  SELECT DISTINCT ON ("entity_id") "entity_id", "user_id"
  FROM "audit_logs"
  WHERE "action" = 'transfer.rejected' AND "user_id" IS NOT NULL
  ORDER BY "entity_id", "created_at" DESC
) AS audit
WHERE level."transfer_id" = audit."entity_id" AND level."rejected_at" IS NOT NULL;

UPDATE "branch_pullout_approval_levels" AS level
SET "rejected_by_id" = audit."user_id"
FROM (
  SELECT DISTINCT ON ("entity_id") "entity_id", "user_id"
  FROM "audit_logs"
  WHERE "action" = 'pullout.rejected' AND "user_id" IS NOT NULL
  ORDER BY "entity_id", "created_at" DESC
) AS audit
WHERE level."pullout_id" = audit."entity_id" AND level."rejected_at" IS NOT NULL;
