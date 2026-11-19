-- Sales returns no longer wait for Customer Service.
-- Dealer Initiated Return / Replacement still on Pending CS moves to Team Leader.
-- Every other pending sales return is approved and recorded against the requester.
-- Open CS ledger rows for those requests are closed. Dealer types get a Team Leader row.
-- Service center returns stay on their own table and keep Customer Service evaluation.

UPDATE "inventory_approvals" AS ia
SET
  "status" = 'CANCELLED',
  "decided_at" = NOW(),
  "updated_at" = NOW(),
  "remarks" = CASE
    WHEN ia."remarks" IS NULL OR btrim(ia."remarks") = ''
      THEN 'Closed because sales returns no longer wait for Customer Service.'
    ELSE ia."remarks"
  END
WHERE ia."source_type" = 'SALES_RETURN'
  AND ia."step" = 'CS_EVALUATION'
  AND ia."status" = 'PENDING'
  AND ia."source_id" IN (
    SELECT r."id"
    FROM "branch_return_requests" r
    WHERE r."status" = 'pending_cs'
  );

INSERT INTO "inventory_approvals" (
  "id",
  "tenant_id",
  "serial_number_id",
  "source_type",
  "source_id",
  "source_no",
  "step",
  "status",
  "requested_by_id",
  "problem_description",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  r."tenant_id",
  chosen."serial_number_id",
  'SALES_RETURN',
  r."id",
  sale."transaction_no",
  'TL_APPROVAL',
  'PENDING',
  r."requested_by_id",
  cs."problem_description",
  NOW(),
  NOW()
FROM "branch_return_requests" r
INNER JOIN "branch_sales_transactions" sale ON sale."id" = r."sale_id"
INNER JOIN "document_types" dt ON dt."id" = r."document_type_id"
LEFT JOIN LATERAL (
  SELECT ia."serial_number_id", ia."problem_description"
  FROM "inventory_approvals" ia
  WHERE ia."tenant_id" = r."tenant_id"
    AND ia."source_type" = 'SALES_RETURN'
    AND ia."source_id" = r."id"
    AND ia."step" = 'CS_EVALUATION'
  ORDER BY ia."created_at"
  LIMIT 1
) cs ON TRUE
LEFT JOIN LATERAL (
  SELECT d."serial_number_id"
  FROM "branch_sales_transaction_details" d
  WHERE d."serial_number_id" IS NOT NULL
    AND (
      d."id" = r."sale_detail_id"
      OR (r."sale_detail_id" IS NULL AND d."sales_id" = r."sale_id")
    )
  ORDER BY
    CASE WHEN d."id" = r."sale_detail_id" THEN 0 ELSE 1 END,
    d."created_at"
  LIMIT 1
) line ON TRUE
CROSS JOIN LATERAL (
  SELECT COALESCE(cs."serial_number_id", line."serial_number_id") AS "serial_number_id"
) chosen
WHERE r."status" = 'pending_cs'
  AND lower(btrim(dt."name")) IN (
    'dealer initiated return',
    'dealer initiated returns',
    'dealer initiated replacement',
    'dealer initiated replacements'
  )
  AND chosen."serial_number_id" IS NOT NULL
ON CONFLICT ("tenant_id", "source_type", "source_id", "step", "serial_number_id")
DO NOTHING;

UPDATE "branch_return_requests" AS r
SET
  "status" = 'pending_tl',
  "updated_at" = NOW()
FROM "document_types" dt
WHERE dt."id" = r."document_type_id"
  AND r."status" = 'pending_cs'
  AND lower(btrim(dt."name")) IN (
    'dealer initiated return',
    'dealer initiated returns',
    'dealer initiated replacement',
    'dealer initiated replacements'
  );

UPDATE "branch_return_requests"
SET
  "status" = 'approved',
  "approved_by_id" = "requested_by_id",
  "approved_at" = COALESCE("approved_at", NOW()),
  "updated_at" = NOW()
WHERE "status" = 'pending_cs';
