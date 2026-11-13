-- Optional image and PDF paths saved with a branch order.
ALTER TABLE "branch_orders"
ADD COLUMN "attachments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
