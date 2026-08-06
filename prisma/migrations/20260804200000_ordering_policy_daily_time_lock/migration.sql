-- Company-wide daily ordering time lock (Manila-local minutes from midnight).
ALTER TABLE "ordering_policies"
  ADD COLUMN IF NOT EXISTS "daily_lock_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "daily_lock_start_minutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "daily_lock_end_minutes" INTEGER;
