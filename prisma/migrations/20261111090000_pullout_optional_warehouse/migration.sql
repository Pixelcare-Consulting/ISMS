-- Pull-outs end In transit with no warehouse receipt, so a new pull-out names no
-- destination warehouse. Existing pull-outs keep the warehouse they recorded.
ALTER TABLE "branch_pullouts" ALTER COLUMN "warehouse_id" DROP NOT NULL;
