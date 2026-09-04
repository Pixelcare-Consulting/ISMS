-- Fixes schema/database drift: prisma/schema.prisma declares
-- `proof String[] @default([])` on BranchSalesTransaction (since commit
-- b6c46ef), but the "proof" column in the database was left as scalar TEXT
-- by migration 20260711230000_excel_schema_gap_align. Reading any row with
-- a non-null "proof" value crashes the Prisma 7 driver-adapter data mapper
-- with "e.map is not a function", because it expects an array in that
-- column but receives a plain string.
--
-- Convert the column to TEXT[], wrapping any existing single-file path in
-- a one-element array so no data is lost.
--
-- Guarded: 20260804130000_sale_proof_text_array was added later with an
-- earlier timestamp and already performs this conversion on a fresh
-- database. Without the guard, ARRAY["proof"] over an already-converted
-- text[] column would silently nest every value into a 2-D array.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'branch_sales_transactions'
      AND column_name = 'proof'
      AND udt_name = 'text'
  ) THEN
    ALTER TABLE "branch_sales_transactions"
      ALTER COLUMN "proof" TYPE TEXT[] USING (
        CASE WHEN "proof" IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY["proof"] END
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
