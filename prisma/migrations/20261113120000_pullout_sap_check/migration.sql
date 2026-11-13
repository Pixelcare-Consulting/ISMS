-- Pull-out "Check SAP": units SAP shows on the IT/Return go DIT → PO (Pulled out), and a DR
-- that redelivers them is tracked on the pull-out line.

-- PO (Pulled out) for each tenant inventory status group that does not have it yet.
INSERT INTO "reason_status_codes" (
  "id",
  "tenant_id",
  "reason_status_id",
  "name",
  "code",
  "color",
  "sort_order",
  "is_system",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  rs.tenant_id,
  rs.id,
  'Pulled out',
  'PO',
  'slate',
  11,
  true,
  NOW()
FROM "reason_statuses" rs
WHERE rs.category = 'inventory_system'
  AND NOT EXISTS (
    SELECT 1
    FROM "reason_status_codes" rsc
    WHERE rsc.reason_status_id = rs.id
      AND rsc.code = 'PO'
  );

-- FTR (For transfer) was only ever added through db:seed:status, so some databases lack it.
-- Old transfers still show it; nothing writes it any more.
INSERT INTO "reason_status_codes" (
  "id",
  "tenant_id",
  "reason_status_id",
  "name",
  "code",
  "color",
  "sort_order",
  "is_system",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  rs.tenant_id,
  rs.id,
  'For transfer',
  'FTR',
  'violet',
  10,
  true,
  NOW()
FROM "reason_statuses" rs
WHERE rs.category = 'inventory_system'
  AND NOT EXISTS (
    SELECT 1
    FROM "reason_status_codes" rsc
    WHERE rsc.reason_status_id = rs.id
      AND rsc.code = 'FTR'
  );

-- The ISMS delivery a redelivered pull-out unit arrived on. Nullable: no data change.
ALTER TABLE "branch_pullout_lines" ADD COLUMN "redelivery_delivery_id" TEXT;

ALTER TABLE "branch_pullout_lines"
  ADD CONSTRAINT "branch_pullout_lines_redelivery_delivery_id_fkey"
  FOREIGN KEY ("redelivery_delivery_id") REFERENCES "branch_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "branch_pullout_lines_redelivery_delivery_id_idx" ON "branch_pullout_lines"("redelivery_delivery_id");
