-- Nullable prior inventory code on transfer and pull-out lines.
-- No backfill. Existing rows stay null so stock is not rewritten.

ALTER TABLE "branch_pullout_lines" ADD COLUMN "prior_status_code_id" TEXT;

ALTER TABLE "branch_transfer_lines" ADD COLUMN "prior_status_code_id" TEXT;

CREATE INDEX "branch_pullout_lines_prior_status_code_id_idx" ON "branch_pullout_lines"("prior_status_code_id");

CREATE INDEX "branch_transfer_lines_prior_status_code_id_idx" ON "branch_transfer_lines"("prior_status_code_id");

ALTER TABLE "branch_transfer_lines" ADD CONSTRAINT "branch_transfer_lines_prior_status_code_id_fkey" FOREIGN KEY ("prior_status_code_id") REFERENCES "reason_status_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "branch_pullout_lines" ADD CONSTRAINT "branch_pullout_lines_prior_status_code_id_fkey" FOREIGN KEY ("prior_status_code_id") REFERENCES "reason_status_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
