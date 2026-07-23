-- Restore separate delivery days (re-add the column dropped by the merge migration)
-- and remove the sp_remarks field (generic system, no per-client remarks).
ALTER TABLE "branch_delivery_schedules" ADD COLUMN "delivery_days" INTEGER[];
ALTER TABLE "branch_delivery_schedules" DROP COLUMN "sp_remarks";
