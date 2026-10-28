-- Transfer slips and per-serial accept / reject. Existing lines stay pending.
ALTER TABLE "branch_transfers" ADD COLUMN IF NOT EXISTS "rs_no" TEXT;
ALTER TABLE "branch_transfers" ADD COLUMN IF NOT EXISTS "dr_no" TEXT;

ALTER TABLE "branch_transfer_lines" ADD COLUMN IF NOT EXISTS "decision" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "branch_transfer_lines" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "branch_transfer_lines" ADD COLUMN IF NOT EXISTS "decided_at" TIMESTAMP(3);
ALTER TABLE "branch_transfer_lines" ADD COLUMN IF NOT EXISTS "decided_by_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "branch_transfer_lines"
    ADD CONSTRAINT "branch_transfer_lines_decided_by_id_fkey"
    FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "branch_transfer_lines_decided_by_id_idx" ON "branch_transfer_lines"("decided_by_id");
CREATE INDEX IF NOT EXISTS "branch_transfer_lines_decision_idx" ON "branch_transfer_lines"("decision");
