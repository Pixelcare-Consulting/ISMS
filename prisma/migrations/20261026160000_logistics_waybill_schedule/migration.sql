-- Waybill, courier, and schedule date on deliveries and transfers.
-- Print stays off until all three are saved. This does not change status or stock.

ALTER TABLE "branch_deliveries"
  ADD COLUMN "waybill_no" TEXT,
  ADD COLUMN "courier_name" TEXT,
  ADD COLUMN "scheduled_at" DATE,
  ADD COLUMN "scheduled_by_id" TEXT;

ALTER TABLE "branch_deliveries"
  ADD CONSTRAINT "branch_deliveries_scheduled_by_id_fkey"
  FOREIGN KEY ("scheduled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "branch_deliveries_scheduled_by_id_idx" ON "branch_deliveries"("scheduled_by_id");

ALTER TABLE "branch_transfers"
  ADD COLUMN "waybill_no" TEXT,
  ADD COLUMN "courier_name" TEXT,
  ADD COLUMN "scheduled_at" DATE,
  ADD COLUMN "scheduled_by_id" TEXT;

ALTER TABLE "branch_transfers"
  ADD CONSTRAINT "branch_transfers_scheduled_by_id_fkey"
  FOREIGN KEY ("scheduled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "branch_transfers_scheduled_by_id_idx" ON "branch_transfers"("scheduled_by_id");
