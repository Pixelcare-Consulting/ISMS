-- Freeze Sales & ATR STATUS on transaction detail lines (not live inventory).
ALTER TABLE "branch_sales_transaction_details" ADD COLUMN "status_code_id" TEXT;

-- Backfill without reading inventory:
-- 1) no serial → FW (TO FOLLOW)
-- 2) atr_status = reserve → RSV
-- 3) atr_status = closed → sales_atr closed
-- 4) else → SLD

UPDATE "branch_sales_transaction_details" AS d
SET "status_code_id" = rsc.id
FROM "branch_sales_transactions" AS s
JOIN "reason_status_codes" AS rsc
  ON rsc."tenant_id" = s."tenant_id"
 AND rsc."code" = 'FW'
 AND rsc."record_status" = 'active'
JOIN "reason_statuses" AS rs
  ON rs.id = rsc."reason_status_id"
 AND rs."category" = 'inventory_system'
 AND rs."record_status" = 'active'
WHERE d."sales_id" = s.id
  AND d."serial_number_id" IS NULL
  AND d."status_code_id" IS NULL;

UPDATE "branch_sales_transaction_details" AS d
SET "status_code_id" = rsc.id
FROM "branch_sales_transactions" AS s
JOIN "reason_status_codes" AS rsc
  ON rsc."tenant_id" = s."tenant_id"
 AND rsc."code" = 'RSV'
 AND rsc."record_status" = 'active'
JOIN "reason_statuses" AS rs
  ON rs.id = rsc."reason_status_id"
 AND rs."category" = 'inventory_system'
 AND rs."record_status" = 'active'
WHERE d."sales_id" = s.id
  AND d."serial_number_id" IS NOT NULL
  AND s."atr_status" = 'reserve'
  AND d."status_code_id" IS NULL;

UPDATE "branch_sales_transaction_details" AS d
SET "status_code_id" = rsc.id
FROM "branch_sales_transactions" AS s
JOIN "reason_status_codes" AS rsc
  ON rsc."tenant_id" = s."tenant_id"
 AND rsc."code" = 'closed'
 AND rsc."record_status" = 'active'
JOIN "reason_statuses" AS rs
  ON rs.id = rsc."reason_status_id"
 AND rs."category" = 'sales_atr'
 AND rs."record_status" = 'active'
WHERE d."sales_id" = s.id
  AND d."serial_number_id" IS NOT NULL
  AND s."atr_status" = 'closed'
  AND d."status_code_id" IS NULL;

UPDATE "branch_sales_transaction_details" AS d
SET "status_code_id" = rsc.id
FROM "branch_sales_transactions" AS s
JOIN "reason_status_codes" AS rsc
  ON rsc."tenant_id" = s."tenant_id"
 AND rsc."code" = 'SLD'
 AND rsc."record_status" = 'active'
JOIN "reason_statuses" AS rs
  ON rs.id = rsc."reason_status_id"
 AND rs."category" = 'inventory_system'
 AND rs."record_status" = 'active'
WHERE d."sales_id" = s.id
  AND d."serial_number_id" IS NOT NULL
  AND d."status_code_id" IS NULL;

-- CreateIndex
CREATE INDEX "branch_sales_transaction_details_status_code_id_idx"
  ON "branch_sales_transaction_details"("status_code_id");

-- AddForeignKey
ALTER TABLE "branch_sales_transaction_details"
  ADD CONSTRAINT "branch_sales_transaction_details_status_code_id_fkey"
  FOREIGN KEY ("status_code_id") REFERENCES "reason_status_codes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
