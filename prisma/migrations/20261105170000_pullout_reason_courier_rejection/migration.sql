-- Courier for the pull-out slip, a reason per unit, and refusing a unit while in transit.
ALTER TABLE "branch_pullouts" ADD COLUMN "courier_name" TEXT;

ALTER TABLE "branch_pullout_lines"
  ADD COLUMN "reason_code_id" TEXT,
  ADD COLUMN "rejected_at" TIMESTAMP(3),
  ADD COLUMN "rejected_by_id" TEXT,
  ADD COLUMN "rejection_remarks" TEXT;

CREATE TABLE "branch_pullout_line_problem_descriptions" (
    "id" TEXT NOT NULL,
    "pullout_line_id" TEXT NOT NULL,
    "problem_description_id" TEXT NOT NULL,

    CONSTRAINT "branch_pullout_line_problem_descriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "branch_pullout_lines_reason_code_id_idx" ON "branch_pullout_lines"("reason_code_id");
CREATE INDEX "branch_pullout_lines_rejected_by_id_idx" ON "branch_pullout_lines"("rejected_by_id");
CREATE INDEX "branch_pullout_line_problem_descriptions_problem_descriptio_idx"
  ON "branch_pullout_line_problem_descriptions"("problem_description_id");
CREATE UNIQUE INDEX "branch_pullout_line_problem_descriptions_pullout_line_id_pr_key"
  ON "branch_pullout_line_problem_descriptions"("pullout_line_id", "problem_description_id");

ALTER TABLE "branch_pullout_lines" ADD CONSTRAINT "branch_pullout_lines_reason_code_id_fkey"
  FOREIGN KEY ("reason_code_id") REFERENCES "reason_status_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branch_pullout_lines" ADD CONSTRAINT "branch_pullout_lines_rejected_by_id_fkey"
  FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branch_pullout_line_problem_descriptions" ADD CONSTRAINT "branch_pullout_line_problem_descriptions_pullout_line_id_fkey"
  FOREIGN KEY ("pullout_line_id") REFERENCES "branch_pullout_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_pullout_line_problem_descriptions" ADD CONSTRAINT "branch_pullout_line_problem_descriptions_problem_descripti_fkey"
  FOREIGN KEY ("problem_description_id") REFERENCES "problem_descriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
