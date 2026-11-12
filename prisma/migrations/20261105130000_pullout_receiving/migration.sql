-- Pull-out receiving: who received each unit, when, and at which warehouse location.
-- Pull-outs do not post to SAP, so this line record is the receipt.
ALTER TABLE "branch_pullout_lines"
  ADD COLUMN "received_at" TIMESTAMP(3),
  ADD COLUMN "received_by_id" TEXT,
  ADD COLUMN "received_location_id" TEXT;

CREATE INDEX "branch_pullout_lines_received_by_id_idx" ON "branch_pullout_lines"("received_by_id");
CREATE INDEX "branch_pullout_lines_received_location_id_idx" ON "branch_pullout_lines"("received_location_id");

ALTER TABLE "branch_pullout_lines"
  ADD CONSTRAINT "branch_pullout_lines_received_by_id_fkey"
  FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "branch_pullout_lines"
  ADD CONSTRAINT "branch_pullout_lines_received_location_id_fkey"
  FOREIGN KEY ("received_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
