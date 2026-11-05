-- Pull-out form: per-unit remarks, per-unit Team Lead decision, and requestor attachments.
ALTER TABLE "branch_pullout_lines"
  ADD COLUMN "decision" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "decided_at" TIMESTAMP(3),
  ADD COLUMN "decided_by_id" TEXT,
  ADD COLUMN "remarks" TEXT;

CREATE INDEX "branch_pullout_lines_decided_by_id_idx" ON "branch_pullout_lines"("decided_by_id");

ALTER TABLE "branch_pullout_lines"
  ADD CONSTRAINT "branch_pullout_lines_decided_by_id_fkey"
  FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "branch_pullout_attachments" (
  "id" TEXT NOT NULL,
  "pullout_id" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "uploaded_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "branch_pullout_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "branch_pullout_attachments_pullout_id_idx" ON "branch_pullout_attachments"("pullout_id");

ALTER TABLE "branch_pullout_attachments"
  ADD CONSTRAINT "branch_pullout_attachments_pullout_id_fkey"
  FOREIGN KEY ("pullout_id") REFERENCES "branch_pullouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_pullout_attachments"
  ADD CONSTRAINT "branch_pullout_attachments_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
