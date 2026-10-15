-- Manual Ordering: move existing Pending TL rows to Pending SP (TL is no longer an approval gate).
-- Auto-replenish / Special pending_tl rows are left unchanged.
UPDATE "branch_orders"
SET status = 'pending_sp'
WHERE "order_type" = 'manual' AND status = 'pending_tl';
