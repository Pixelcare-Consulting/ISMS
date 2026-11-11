-- Display unit (DU) for each tenant inventory status group that does not have it yet.
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
  'Display unit',
  'DU',
  'amber',
  3,
  true,
  NOW()
FROM "reason_statuses" rs
WHERE rs.category = 'inventory_system'
  AND NOT EXISTS (
    SELECT 1
    FROM "reason_status_codes" rsc
    WHERE rsc.reason_status_id = rs.id
      AND rsc.code = 'DU'
  );
