-- Optional link from a sent pull-out unit to the IT or Return a user created by hand in SAP.
-- All columns nullable: existing lines stay unlinked. No data change.
CREATE TYPE "PulloutSapDocType" AS ENUM ('IT', 'RETURN');

ALTER TABLE "branch_pullout_lines"
  ADD COLUMN "sap_doc_type" "PulloutSapDocType",
  ADD COLUMN "sap_doc_entry" INTEGER,
  ADD COLUMN "sap_doc_num" INTEGER,
  ADD COLUMN "sap_doc_date" DATE,
  ADD COLUMN "sap_doc_linked_at" TIMESTAMP(3),
  ADD COLUMN "sap_doc_linked_by_id" TEXT;

ALTER TABLE "branch_pullout_lines"
  ADD CONSTRAINT "branch_pullout_lines_sap_doc_linked_by_id_fkey"
  FOREIGN KEY ("sap_doc_linked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "branch_pullout_lines_sap_doc_linked_by_id_idx" ON "branch_pullout_lines"("sap_doc_linked_by_id");
CREATE INDEX "branch_pullout_lines_sap_doc_type_sap_doc_num_idx" ON "branch_pullout_lines"("sap_doc_type", "sap_doc_num");
