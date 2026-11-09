-- How many days back a new sales transaction may be dated (Settings → Ordering policy).
-- Add-only: existing rows get the default of 7 days.
ALTER TABLE "ordering_policies" ADD COLUMN "sales_backdate_days" INTEGER NOT NULL DEFAULT 7;
