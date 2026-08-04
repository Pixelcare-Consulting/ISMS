-- Link approval-level actor to users (column already existed; FK was missing).
ALTER TABLE "branch_order_approval_levels"
ADD CONSTRAINT "branch_order_approval_levels_approved_by_id_fkey"
FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
