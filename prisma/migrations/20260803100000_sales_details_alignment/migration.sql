-- Sales details alignment (idempotent): drop header serial FK; ensure slip/RR text;
-- stock source branch; detail package/brand/promo FKs.

-- Ensure slip/RR columns are text (no-op if already text)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branch_sales_transactions'
      AND column_name = 'info_slip_vso_rr_released'
      AND data_type = 'boolean'
  ) THEN
    ALTER TABLE "branch_sales_transactions"
      ALTER COLUMN "info_slip_vso_rr_released" DROP DEFAULT;
    ALTER TABLE "branch_sales_transactions"
      ALTER COLUMN "info_slip_vso_rr_released" TYPE TEXT
      USING (
        CASE
          WHEN "info_slip_vso_rr_released" IS TRUE THEN 'true'
          WHEN "info_slip_vso_rr_released" IS FALSE THEN 'false'
          ELSE NULL
        END
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branch_sales_transactions'
      AND column_name = 'rr_receive_deliver'
      AND data_type = 'boolean'
  ) THEN
    ALTER TABLE "branch_sales_transactions"
      ALTER COLUMN "rr_receive_deliver" DROP DEFAULT;
    ALTER TABLE "branch_sales_transactions"
      ALTER COLUMN "rr_receive_deliver" TYPE TEXT
      USING (
        CASE
          WHEN "rr_receive_deliver" IS TRUE THEN 'true'
          WHEN "rr_receive_deliver" IS FALSE THEN 'false'
          ELSE NULL
        END
      );
  END IF;
END $$;

-- Stock-source branch (sold branch or alternate warehouse)
ALTER TABLE "branch_sales_transactions"
  ADD COLUMN IF NOT EXISTS "alternate_branch_id" TEXT;

UPDATE "branch_sales_transactions"
SET "alternate_branch_id" = "branch_id"
WHERE "alternate_branch_id" IS NULL;

-- Ensure every header serial has a matching detail row before dropping the column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branch_sales_transactions'
      AND column_name = 'serial_number_id'
  ) THEN
    INSERT INTO "branch_sales_transaction_details" (
      "id",
      "sales_id",
      "model_id",
      "serial_number_id",
      "model_price",
      "sale_amount",
      "amount",
      "created_at",
      "updated_at"
    )
    SELECT
      'bsd' || substr(md5(s.id || E'\n' || s.serial_number_id), 1, 22),
      s.id,
      sn.model_id,
      s.serial_number_id,
      s.model_price,
      s.amount,
      s.amount,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM "branch_sales_transactions" s
    INNER JOIN "serial_numbers" sn ON sn.id = s.serial_number_id
    WHERE s.serial_number_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "branch_sales_transaction_details" d
        WHERE d.sales_id = s.id
          AND d.serial_number_id = s.serial_number_id
      );
  END IF;
END $$;

-- Drop header serial FK + column
ALTER TABLE "branch_sales_transactions"
  DROP CONSTRAINT IF EXISTS "branch_sales_transactions_serial_number_id_fkey";
DROP INDEX IF EXISTS "branch_sales_transactions_serial_number_id_idx";
ALTER TABLE "branch_sales_transactions"
  DROP COLUMN IF EXISTS "serial_number_id";

-- Detail package / brand / promo
ALTER TABLE "branch_sales_transaction_details"
  ADD COLUMN IF NOT EXISTS "package_type_id" TEXT;
ALTER TABLE "branch_sales_transaction_details"
  ADD COLUMN IF NOT EXISTS "brand_id" TEXT;
ALTER TABLE "branch_sales_transaction_details"
  ADD COLUMN IF NOT EXISTS "promo_type_id" TEXT;

CREATE INDEX IF NOT EXISTS "branch_sales_transactions_alternate_branch_id_idx"
  ON "branch_sales_transactions"("alternate_branch_id");

CREATE INDEX IF NOT EXISTS "branch_sales_transaction_details_package_type_id_idx"
  ON "branch_sales_transaction_details"("package_type_id");
CREATE INDEX IF NOT EXISTS "branch_sales_transaction_details_brand_id_idx"
  ON "branch_sales_transaction_details"("brand_id");
CREATE INDEX IF NOT EXISTS "branch_sales_transaction_details_promo_type_id_idx"
  ON "branch_sales_transaction_details"("promo_type_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branch_sales_transactions_alternate_branch_id_fkey'
  ) THEN
    ALTER TABLE "branch_sales_transactions"
      ADD CONSTRAINT "branch_sales_transactions_alternate_branch_id_fkey"
      FOREIGN KEY ("alternate_branch_id") REFERENCES "branches"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branch_sales_transaction_details_package_type_id_fkey'
  ) THEN
    ALTER TABLE "branch_sales_transaction_details"
      ADD CONSTRAINT "branch_sales_transaction_details_package_type_id_fkey"
      FOREIGN KEY ("package_type_id") REFERENCES "package_types"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branch_sales_transaction_details_brand_id_fkey'
  ) THEN
    ALTER TABLE "branch_sales_transaction_details"
      ADD CONSTRAINT "branch_sales_transaction_details_brand_id_fkey"
      FOREIGN KEY ("brand_id") REFERENCES "brands"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branch_sales_transaction_details_promo_type_id_fkey'
  ) THEN
    ALTER TABLE "branch_sales_transaction_details"
      ADD CONSTRAINT "branch_sales_transaction_details_promo_type_id_fkey"
      FOREIGN KEY ("promo_type_id") REFERENCES "promo_types"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
