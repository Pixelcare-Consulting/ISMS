-- Scope company weekday + daily time locks to selected order modules (default: Manual).
ALTER TABLE "ordering_policies"
  ADD COLUMN IF NOT EXISTS "lock_applies_to_order_types" "BranchOrderType"[] NOT NULL DEFAULT ARRAY['manual']::"BranchOrderType"[];
