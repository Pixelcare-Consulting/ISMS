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
ALTER TABLE "branch_sales_transactions"
  ALTER COLUMN "proof" TYPE TEXT[] USING (
    CASE WHEN "proof" IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY["proof"] END
  );

ALTER TABLE "branch_sales_transactions"
  ALTER COLUMN "proof" SET DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "branch_sales_transactions"
  ALTER COLUMN "proof" SET NOT NULL;
