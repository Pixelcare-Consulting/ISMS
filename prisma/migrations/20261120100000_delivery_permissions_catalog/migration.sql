-- The delivery permissions were only in prisma/seed-data.ts, so databases that were never
-- re-seeded (staging, client) have no rows for them and Settings -> Roles cannot grant them.
-- Add the catalog rows, then grant them so nobody loses or gains access beyond the seed intent.

INSERT INTO "permissions" ("id", "slug", "name", "created_at", "updated_at") VALUES
  (gen_random_uuid()::text, 'logistics.delivery.dispatch', 'Dispatch deliveries (post IT/DR to SAP)', NOW(), NOW()),
  (gen_random_uuid()::text, 'logistics.delivery.receive', 'Accept delivered units', NOW(), NOW()),
  (gen_random_uuid()::text, 'logistics.delivery_return.request', 'Request full delivery return', NOW(), NOW()),
  (gen_random_uuid()::text, 'logistics.delivery_return.approve', 'Approve delivery return', NOW(), NOW()),
  (gen_random_uuid()::text, 'logistics.delivery_transfer.create', 'Create transfer for units not accepted', NOW(), NOW()),
  (gen_random_uuid()::text, 'logistics.delivery_transfer.approve', 'Approve transfer lines for units not accepted', NOW(), NOW()),
  (gen_random_uuid()::text, 'logistics.delivery_transfer.receive', 'Receive transferred units', NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;

-- Receive already worked through logistics.create / logistics.manage / orders.create, and
-- Dispatch through logistics.manage. Grant the named slug to the same roles so the checkbox
-- shows what they can do.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, granted."role_id", target."id", NOW()
FROM (
  SELECT DISTINCT existing."role_id"
  FROM "role_permissions" AS existing
  INNER JOIN "permissions" AS gate
    ON gate."id" = existing."permission_id"
    AND gate."slug" IN ('logistics.create', 'logistics.manage', 'orders.create')
) AS granted
CROSS JOIN "permissions" AS target
WHERE target."slug" = 'logistics.delivery.receive'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, granted."role_id", target."id", NOW()
FROM (
  SELECT DISTINCT existing."role_id"
  FROM "role_permissions" AS existing
  INNER JOIN "permissions" AS gate
    ON gate."id" = existing."permission_id"
    AND gate."slug" = 'logistics.manage'
) AS granted
CROSS JOIN "permissions" AS target
WHERE target."slug" IN ('logistics.delivery.dispatch', 'logistics.delivery_return.request')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- Approve only settles old pending returns and cancels or retries one SAP never took:
-- Team Leaders, as in the seed.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, role."id", target."id", NOW()
FROM "roles" AS role
CROSS JOIN "permissions" AS target
WHERE role."slug" = 'tl'
  AND role."deleted_at" IS NULL
  AND target."slug" = 'logistics.delivery_return.approve'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
