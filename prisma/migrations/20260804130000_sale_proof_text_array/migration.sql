-- Align sales proof storage with Postgres text[] (multi-file attachments).
-- Idempotent: no-op when already text[]; converts TEXT values when needed.
--
-- The conversion runs through a temporary column instead of
-- `ALTER COLUMN ... TYPE text[] USING (...)`, because Postgres rejects a
-- subquery inside an ALTER ... USING transform expression
-- (SQLSTATE 0A000, "cannot use subquery in transform expression") and the
-- JSON-array case needs jsonb_array_elements_text(). UPDATE has no such
-- restriction.

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
      ALTER COLUMN "proof" DROP DEFAULT;

    ALTER TABLE "branch_sales_transactions"
      ADD COLUMN "proof__text_array" text[];

    UPDATE "branch_sales_transactions"
    SET "proof__text_array" = CASE
      WHEN "proof" IS NULL OR btrim("proof") = '' THEN ARRAY[]::text[]
      WHEN btrim("proof") LIKE '[%' THEN (
        SELECT coalesce(array_agg(elem), ARRAY[]::text[])
        FROM jsonb_array_elements_text(btrim("proof")::jsonb) AS elem
      )
      ELSE ARRAY[btrim("proof")]
    END;

    ALTER TABLE "branch_sales_transactions"
      DROP COLUMN "proof";

    ALTER TABLE "branch_sales_transactions"
      RENAME COLUMN "proof__text_array" TO "proof";
  END IF;
END $$;

ALTER TABLE "branch_sales_transactions"
  ALTER COLUMN "proof" SET DEFAULT ARRAY[]::text[];

UPDATE "branch_sales_transactions"
SET "proof" = ARRAY[]::text[]
WHERE "proof" IS NULL;
