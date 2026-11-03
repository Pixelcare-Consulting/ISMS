-- Per-brand Target DII (days) on branch quotas, shown on orders as "Target DII".
ALTER TABLE "branch_quotas" ADD COLUMN "target_dii" DECIMAL(8,1);
