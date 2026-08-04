-- Catch up branch_sales_transactions with schema.prisma:
-- add missing contact_no column; convert proof from TEXT to TEXT[].

ALTER TABLE "branch_sales_transactions"
  ADD COLUMN IF NOT EXISTS "contact_no" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branch_sales_transactions'
      AND column_name = 'proof'
      AND data_type <> 'ARRAY'
  ) THEN
    ALTER TABLE "branch_sales_transactions"
      ALTER COLUMN "proof" TYPE TEXT[]
      USING (
        CASE
          WHEN "proof" IS NULL THEN ARRAY[]::TEXT[]
          ELSE ARRAY["proof"]
        END
      );
  END IF;
END $$;

ALTER TABLE "branch_sales_transactions"
  ALTER COLUMN "proof" SET DEFAULT ARRAY[]::TEXT[];

UPDATE "branch_sales_transactions"
SET "proof" = ARRAY[]::TEXT[]
WHERE "proof" IS NULL;

ALTER TABLE "branch_sales_transactions"
  ALTER COLUMN "proof" SET NOT NULL;
