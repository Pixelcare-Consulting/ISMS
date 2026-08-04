-- Align sales proof storage with Postgres text[] (multi-file attachments).
-- Idempotent: no-op when already text[]; converts TEXT values when needed.

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
      ALTER COLUMN "proof" TYPE text[]
      USING (
        CASE
          WHEN "proof" IS NULL OR btrim("proof") = '' THEN ARRAY[]::text[]
          WHEN btrim("proof") LIKE '[%' THEN (
            SELECT coalesce(array_agg(elem), ARRAY[]::text[])
            FROM jsonb_array_elements_text(btrim("proof")::jsonb) AS elem
          )
          ELSE ARRAY[btrim("proof")]
        END
      );
  END IF;
END $$;

ALTER TABLE "branch_sales_transactions"
  ALTER COLUMN "proof" SET DEFAULT ARRAY[]::text[];

UPDATE "branch_sales_transactions"
SET "proof" = ARRAY[]::text[]
WHERE "proof" IS NULL;
