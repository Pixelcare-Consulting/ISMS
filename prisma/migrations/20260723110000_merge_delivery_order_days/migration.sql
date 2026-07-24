-- Collapse delivery_days + order_days into a single ordering/delivery day list.
-- order_days is retained as the single source; delivery_days is dropped.
ALTER TABLE "branch_delivery_schedules" DROP COLUMN "delivery_days";
