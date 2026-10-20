-- Supply Planning line remarks, and the review figures stored with final approval.
ALTER TABLE "branch_order_details" ADD COLUMN "sp_remarks" TEXT;

ALTER TABLE "branch_orders" ADD COLUMN "review_snapshot" JSONB;
ALTER TABLE "branch_orders" ADD COLUMN "review_snapshot_at" TIMESTAMP(3);
